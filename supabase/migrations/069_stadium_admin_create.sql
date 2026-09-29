-- Stadiums are created only from SpoJex admin, same as events.
-- Assigned managers can still update a listing they already manage.
-- Safe to re-run.

drop policy if exists stadiums_manager_write on public.stadiums;
drop policy if exists stadiums_admin_insert on public.stadiums;
create policy stadiums_admin_insert on public.stadiums
  for insert
  with check (public.has_admin_permission('stadiums:write'));

drop policy if exists stadium_managers_owner_insert on public.stadium_managers;

notify pgrst, 'reload schema';
