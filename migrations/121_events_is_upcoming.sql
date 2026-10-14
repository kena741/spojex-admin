-- Mark events for the app "Upcoming Events" rail (admin-controlled).
-- Safe to re-run.

alter table public.events
  add column if not exists is_upcoming boolean not null default false;

create index if not exists events_is_upcoming_idx
  on public.events (is_upcoming)
  where is_upcoming = true;

comment on column public.events.is_upcoming is
  'When true, event appears in the Spojex app Upcoming Events section.';
