-- Allow multiple non-overlapping weekly slots per weekday.
-- Weekly rows: day_of_week 0=Sun … 6=Sat, specific_date is null.
-- Run after 039_events_storage.sql. Safe to re-run.

drop index if exists public.stadium_availability_weekly_uniq;

create index if not exists stadium_availability_weekly_day_idx
  on public.stadium_availability (stadium_id, day_of_week, start_time)
  where specific_date is null and day_of_week is not null;

notify pgrst, 'reload schema';
