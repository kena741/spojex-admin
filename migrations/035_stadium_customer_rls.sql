-- stadium_subscriptions / bookings / payments.user_id → public.users(id).
-- RLS still compared that column to auth.uid(), so fan inserts failed after
-- the client started writing the profile id. Match either id.

create or replace function public.is_current_football_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and (
      p_user_id = auth.uid()
      or exists (
        select 1
        from public.users u
        where u.id = p_user_id
          and u.user_id = auth.uid()
      )
    );
$$;

grant execute on function public.is_current_football_user(uuid) to authenticated;

-- subscriptions
drop policy if exists stadium_subscriptions_select on public.stadium_subscriptions;
drop policy if exists stadium_subscriptions_insert on public.stadium_subscriptions;
drop policy if exists stadium_subscriptions_update on public.stadium_subscriptions;

create policy stadium_subscriptions_select on public.stadium_subscriptions
  for select using (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:read')
  );

create policy stadium_subscriptions_insert on public.stadium_subscriptions
  for insert with check (public.is_current_football_user(user_id));

create policy stadium_subscriptions_update on public.stadium_subscriptions
  for update using (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  )
  with check (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  );

-- bookings
drop policy if exists stadium_bookings_select on public.stadium_bookings;
drop policy if exists stadium_bookings_insert on public.stadium_bookings;
drop policy if exists stadium_bookings_update on public.stadium_bookings;

create policy stadium_bookings_select on public.stadium_bookings
  for select using (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:read')
  );

create policy stadium_bookings_insert on public.stadium_bookings
  for insert with check (public.is_current_football_user(user_id));

create policy stadium_bookings_update on public.stadium_bookings
  for update using (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  )
  with check (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  );

-- payments (owner must also update after Chapa)
drop policy if exists stadium_payments_select on public.stadium_payments;
drop policy if exists stadium_payments_insert on public.stadium_payments;
drop policy if exists stadium_payments_update on public.stadium_payments;

create policy stadium_payments_select on public.stadium_payments
  for select using (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:read')
  );

create policy stadium_payments_insert on public.stadium_payments
  for insert with check (public.is_current_football_user(user_id));

create policy stadium_payments_update on public.stadium_payments
  for update using (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  )
  with check (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  );

notify pgrst, 'reload schema';
