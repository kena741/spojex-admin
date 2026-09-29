-- Walk-in bookings created by stadium managers (guest name/phone).
-- Managers may insert bookings and cash session payments for their stadium.

alter table public.stadium_bookings
  add column if not exists guest_name text not null default '';

alter table public.stadium_bookings
  add column if not exists guest_phone text not null default '';

drop policy if exists stadium_bookings_insert on public.stadium_bookings;
create policy stadium_bookings_insert on public.stadium_bookings
  for insert with check (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
  );

drop policy if exists stadium_payments_insert on public.stadium_payments;
create policy stadium_payments_insert on public.stadium_payments
  for insert with check (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
  );

notify pgrst, 'reload schema';
