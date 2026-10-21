-- Event admin hardening (mirror of Alembic a1spojex000061).
-- Prefer API Alembic deploy path.

create table if not exists public.event_admin_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null,
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  reason text,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists event_admin_events_event_created_idx
  on public.event_admin_events (event_id, created_at desc);

create unique index if not exists event_admin_events_idempotency_uidx
  on public.event_admin_events (idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

alter table public.event_managers
  add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.event_tickets
  add column if not exists purchased_unit_price numeric;
alter table public.event_tickets
  add column if not exists purchased_currency text;

update public.event_tickets
set
  purchased_unit_price = coalesce(
    purchased_unit_price,
    case when quantity > 0 then amount / quantity else amount end
  ),
  purchased_currency = coalesce(purchased_currency, currency)
where purchased_unit_price is null;

create index if not exists events_admin_directory_idx
  on public.events (status, lifecycle, starts_at desc);

create index if not exists events_visibility_idx
  on public.events (visibility);

create index if not exists event_tickets_event_status_idx
  on public.event_tickets (event_id, status);

create index if not exists event_tickets_tier_status_idx
  on public.event_tickets (tier_id, status);

create index if not exists event_scan_logs_event_created_idx
  on public.event_scan_logs (event_id, created_at desc);

notify pgrst, 'reload schema';
