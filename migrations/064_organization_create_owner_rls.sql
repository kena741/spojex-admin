-- Ensure any signed-in individual can create an organization they own.
-- Owner is public.users.id (not auth.users.id). Safe to re-run after 014.
-- Admin creates use the service role and bypass RLS.
-- Run after 063_service_admin_approval.sql.

alter table public.organizations enable row level security;

drop policy if exists organizations_select on public.organizations;
drop policy if exists organizations_insert on public.organizations;
drop policy if exists organizations_update on public.organizations;
drop policy if exists organizations_delete on public.organizations;

create policy organizations_select on public.organizations
  for select using (true);

create policy organizations_insert on public.organizations
  for insert with check (
    user_id in (select id from public.users where user_id = auth.uid())
  );

create policy organizations_update on public.organizations
  for update
  using (user_id in (select id from public.users where user_id = auth.uid()))
  with check (user_id in (select id from public.users where user_id = auth.uid()));

create policy organizations_delete on public.organizations
  for delete
  using (user_id in (select id from public.users where user_id = auth.uid()));

notify pgrst, 'reload schema';
