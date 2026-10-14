-- Admin can set Mon–Sun stadium hours and one-off blocked slots.
-- Weekly rows: day_of_week 0=Sun … 6=Sat, specific_date is null.
-- Blocks: specific_date set, is_blocked true.
-- Run after 036_stadium_manager_walkin.sql. Safe to re-run.

drop policy if exists stadium_availability_select on public.stadium_availability;
create policy stadium_availability_select on public.stadium_availability
  for select using (
    exists (
      select 1 from public.stadiums s
      where s.id = stadium_id
        and (
          s.status = 'active'
          or public.can_manage_stadium(s.id)
          or public.has_admin_permission('stadiums:read')
        )
    )
  );

drop policy if exists stadium_availability_write on public.stadium_availability;
create policy stadium_availability_write on public.stadium_availability
  for all using (
    public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  )
  with check (
    public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  );

delete from public.stadium_availability a
using public.stadium_availability b
where a.ctid > b.ctid
  and a.stadium_id = b.stadium_id
  and a.day_of_week is not distinct from b.day_of_week
  and a.specific_date is null
  and b.specific_date is null
  and a.day_of_week is not null;

create unique index if not exists stadium_availability_weekly_uniq
  on public.stadium_availability (stadium_id, day_of_week)
  where specific_date is null and day_of_week is not null;

notify pgrst, 'reload schema';
