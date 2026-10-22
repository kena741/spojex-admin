-- Streams admin hardening (mirror of Alembic a1spojex000064).
-- Prefer API Alembic deploy path.

alter table public.radio_streams add column if not exists source_id text;
alter table public.radio_streams add column if not exists health_status text not null default 'unknown';
alter table public.radio_streams add column if not exists health_checked_at timestamptz;
alter table public.radio_streams add column if not exists health_message text not null default '';

update public.radio_streams
set source_id = coalesce(nullif(trim(slug), ''), id::text)
where source_id is null;

create unique index if not exists radio_streams_source_id_uidx
  on public.radio_streams (source_id)
  where source_id is not null and source_id <> '';

create index if not exists radio_streams_admin_directory_idx
  on public.radio_streams (status, is_featured, updated_at desc);

alter table public.radio_stream_gifts
  add column if not exists credited_user_id uuid references public.users (id) on delete set null;

alter table public.live_event_gifts
  add column if not exists credited_user_id uuid references public.users (id) on delete set null;

alter table public.live_events add column if not exists actual_started_at timestamptz;
alter table public.live_events add column if not exists actual_ended_at timestamptz;
alter table public.live_events add column if not exists visibility text not null default 'public';
alter table public.live_events add column if not exists timezone text not null default 'Africa/Addis_Ababa';
alter table public.live_events add column if not exists source_type text not null default 'external_url';
alter table public.live_events add column if not exists source_ready boolean not null default false;

create index if not exists live_events_admin_directory_idx
  on public.live_events (status, kind, starts_at desc);

create table if not exists public.streams_admin_events (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null,
  resource_id uuid not null,
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null,
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  reason text,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists streams_admin_events_resource_idx
  on public.streams_admin_events (resource_type, resource_id, created_at desc);

create unique index if not exists streams_admin_events_idempotency_uidx
  on public.streams_admin_events (idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

notify pgrst, 'reload schema';
