-- Donation admin hardening (mirror of Alembic a1spojex000063).
-- Prefer API Alembic deploy path.

alter table public.donation_contributions
  add column if not exists credited_user_id uuid
    references public.users (id) on delete set null;

update public.donation_contributions dc
set credited_user_id = camp.beneficiary_user_id
from public.donation_campaigns camp
where camp.id = dc.campaign_id
  and dc.credited_user_id is null
  and camp.beneficiary_user_id is not null;

create index if not exists donation_contributions_campaign_status_idx
  on public.donation_contributions (campaign_id, status);

create index if not exists donation_contributions_credited_idx
  on public.donation_contributions (credited_user_id)
  where credited_user_id is not null;

create index if not exists donation_campaigns_admin_directory_idx
  on public.donation_campaigns (status, is_featured, updated_at desc);

create table if not exists public.donation_admin_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.donation_campaigns (id) on delete cascade,
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null,
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  reason text,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists donation_admin_events_campaign_created_idx
  on public.donation_admin_events (campaign_id, created_at desc);

create unique index if not exists donation_admin_events_idempotency_uidx
  on public.donation_admin_events (idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

notify pgrst, 'reload schema';
