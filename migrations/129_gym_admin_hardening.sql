-- Gym admin hardening (mirror of Alembic a1spojex000060).
-- Prefer API Alembic deploy path.

create table if not exists public.gym_admin_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null,
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  reason text,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists gym_admin_events_gym_created_idx
  on public.gym_admin_events (gym_id, created_at desc);

create unique index if not exists gym_admin_events_idempotency_uidx
  on public.gym_admin_events (idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

alter table public.gym_memberships
  add column if not exists purchased_plan_title text;
alter table public.gym_memberships
  add column if not exists purchased_price_amount numeric;
alter table public.gym_memberships
  add column if not exists purchased_currency text;
alter table public.gym_memberships
  add column if not exists purchased_duration_months integer;
alter table public.gym_memberships
  add column if not exists purchased_duration_days integer;

update public.gym_memberships ms
set
  purchased_plan_title = coalesce(ms.purchased_plan_title, p.title),
  purchased_price_amount = coalesce(ms.purchased_price_amount, p.price_amount),
  purchased_currency = coalesce(ms.purchased_currency, p.currency),
  purchased_duration_months = coalesce(ms.purchased_duration_months, p.duration_months),
  purchased_duration_days = coalesce(ms.purchased_duration_days, p.duration_days)
from public.gym_plans p
where p.id = ms.plan_id
  and (
    ms.purchased_plan_title is null
    or ms.purchased_price_amount is null
  );

create index if not exists gyms_admin_directory_idx
  on public.gyms (status, verification_status, is_featured, created_at desc);

create index if not exists gyms_category_idx
  on public.gyms (category);

create index if not exists gyms_city_idx
  on public.gyms (city);

create index if not exists gym_members_gym_active_idx
  on public.gym_members (gym_id, is_active);

create index if not exists gym_memberships_gym_status_idx
  on public.gym_memberships (gym_id, status);

notify pgrst, 'reload schema';
