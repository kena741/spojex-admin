-- Multi-unit stadium passes: quantity + exact ends_at (hourly).
alter table public.stadium_subscriptions
  add column if not exists quantity integer not null default 1;

alter table public.stadium_subscriptions
  add column if not exists ends_at timestamptz;

comment on column public.stadium_subscriptions.quantity is
  'Units purchased (hours / days / months / years) at unit rate.';
comment on column public.stadium_subscriptions.ends_at is
  'Exact expiry for hourly (and optional timed) passes; else use end_date.';

update public.stadiums
   set pricing = pricing || jsonb_build_object('daily', pricing->'session')
 where pricing ? 'session'
   and not (pricing ? 'daily');
