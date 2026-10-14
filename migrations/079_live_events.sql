-- Live streams, football matches, and fights.
-- Public can watch scheduled/live/finished rows. Admin writes via events:write.

create table if not exists public.live_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('stream', 'football', 'fight')),
  name text not null,
  slug text unique,
  thumbnail_url text not null default '',
  stream_url text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'finished', 'cancelled')),
  home_name text not null default '',
  away_name text not null default '',
  home_score int not null default 0,
  away_score int not null default 0,
  match_minute int not null default 0,
  match_period text not null default '',
  fighter_a text not null default '',
  fighter_b text not null default '',
  current_round int not null default 1,
  total_rounds int not null default 5,
  round_seconds_left int not null default 0,
  fight_result text not null default '',
  description text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_events_starts_idx
  on public.live_events (status, starts_at desc);

create index if not exists live_events_kind_idx
  on public.live_events (kind, starts_at desc);

drop trigger if exists live_events_updated_at on public.live_events;
create trigger live_events_updated_at
  before update on public.live_events
  for each row execute function public.set_updated_at();

alter table public.live_events enable row level security;

drop policy if exists live_events_public_select on public.live_events;
drop policy if exists live_events_admin_write on public.live_events;

create policy live_events_public_select on public.live_events
  for select using (
    status in ('scheduled', 'live', 'finished')
    or public.has_admin_permission('events:read')
    or public.has_admin_permission('streams:read')
  );

create policy live_events_admin_write on public.live_events
  for all using (
    public.has_admin_permission('events:write')
    or public.has_admin_permission('streams:write')
  )
  with check (
    public.has_admin_permission('events:write')
    or public.has_admin_permission('streams:write')
  );

grant select, insert, update, delete on public.live_events to authenticated;
grant select on public.live_events to anon;

do $$
begin
  execute 'alter publication supabase_realtime add table public.live_events';
exception
  when duplicate_object then null;
end $$;
