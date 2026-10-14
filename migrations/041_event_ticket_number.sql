-- Sequential ticket numbers per event, and sold-out counting helpers.
-- Run after 040_stadium_multi_slots.sql. Safe to re-run.

alter table public.event_tickets
  add column if not exists ticket_number int;

update public.event_tickets t
set ticket_number = numbered.n
from (
  select
    id,
    row_number() over (partition by event_id order by created_at, id) as n
  from public.event_tickets
  where ticket_number is null
) numbered
where t.id = numbered.id
  and t.ticket_number is null;

create unique index if not exists event_tickets_event_number_uniq
  on public.event_tickets (event_id, ticket_number)
  where ticket_number is not null;

notify pgrst, 'reload schema';
