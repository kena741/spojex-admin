-- Chapa checkout for donations: pending contributions, provider_ref, fan RLS.
-- Run after 042_stadium_pass_code.sql. Safe to re-run.

alter table public.donation_contributions
  add column if not exists provider_ref text not null default '';

alter table public.donation_contributions
  alter column status set default 'pending';

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.donation_contributions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format(
      'alter table public.donation_contributions drop constraint if exists %I',
      r.conname
    );
  end loop;
end $$;

alter table public.donation_contributions
  add constraint donation_contributions_status_check
  check (status in ('pending', 'completed', 'refunded', 'cancelled'));

drop policy if exists donation_contributions_select on public.donation_contributions;
drop policy if exists donation_contributions_insert on public.donation_contributions;
drop policy if exists donation_contributions_update on public.donation_contributions;
drop policy if exists donation_contributions_admin on public.donation_contributions;

create policy donation_contributions_select on public.donation_contributions
  for select using (
    public.is_current_football_user(user_id)
    or public.has_admin_permission('donations:read')
    or (
      status = 'completed'
      and exists (
        select 1 from public.donation_campaigns c
        where c.id = campaign_id and c.status = 'active'
      )
    )
  );

create policy donation_contributions_insert on public.donation_contributions
  for insert with check (
    public.is_current_football_user(user_id)
    and status = 'pending'
    and exists (
      select 1 from public.donation_campaigns c
      where c.id = campaign_id and c.status = 'active'
    )
  );

create policy donation_contributions_update on public.donation_contributions
  for update using (
    public.is_current_football_user(user_id)
    and status = 'pending'
  )
  with check (
    public.is_current_football_user(user_id)
    and status in ('pending', 'completed', 'cancelled')
  );

create policy donation_contributions_admin on public.donation_contributions
  for all using (public.has_admin_permission('donations:write'))
  with check (public.has_admin_permission('donations:write'));

notify pgrst, 'reload schema';
