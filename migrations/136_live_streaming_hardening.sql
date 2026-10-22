-- Live streaming hardening: health, retention, reminders, lifecycle helpers.
-- Mirrors spojex_backend Alembic a1spojex000069. Prefer applying via Alembic in prod.

alter table public.live_events
  add column if not exists health_status text not null default 'unknown',
  add column if not exists health_checked_at timestamptz,
  add column if not exists health_message text,
  add column if not exists chat_retention_hours int not null default 24,
  add column if not exists recording_enabled boolean not null default false,
  add column if not exists recording_retention_days int,
  add column if not exists reconnect_grace_seconds int not null default 120,
  add column if not exists category text,
  add column if not exists language text default 'en';

create table if not exists public.live_event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.live_events (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  offset_minutes int not null default 15,
  channel text not null default 'push',
  scheduled_for timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id, offset_minutes, channel)
);

create index if not exists live_event_reminders_due_idx
  on public.live_event_reminders (scheduled_for)
  where sent_at is null and cancelled_at is null;

-- Full function bodies live in the Alembic migration; this SQL is a schema
-- bootstrap for environments that apply admin/migrations/*.sql first.
comment on table public.live_event_reminders is
  'Idempotent reminder subscriptions for scheduled live events.';
