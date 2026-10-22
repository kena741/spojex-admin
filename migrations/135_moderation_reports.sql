-- Mirror of Alembic a1spojex000068 — unified moderation reports hardening.

alter table public.reports
  add column if not exists target_type text;

alter table public.reports
  add column if not exists target_id uuid;

alter table public.reports
  add column if not exists reason_code text;

alter table public.reports
  add column if not exists status text not null default 'open';

alter table public.reports
  add column if not exists assigned_admin_id uuid references public.admin (id) on delete set null;

alter table public.reports
  add column if not exists resolved_at timestamptz;

alter table public.reports
  add column if not exists resolution_code text;

alter table public.reports
  add column if not exists resolution_note text not null default '';

alter table public.reports
  add column if not exists evidence jsonb not null default '{}'::jsonb;

alter table public.reports
  add column if not exists conversation_id uuid;

alter table public.reports
  add column if not exists organization_id uuid;

alter table public.reports
  add column if not exists content_surface text not null default '';

alter table public.reports
  add column if not exists target_removed boolean not null default false;

alter table public.reports
  add column if not exists idempotency_key text;

alter table public.reports
  add column if not exists updated_at timestamptz not null default now();

update public.reports
set target_type = coalesce(
  target_type,
  case
    when target_message_id is not null then 'message'
    when target_service_id is not null then 'service'
    when target_user_id is not null then 'user'
    else 'unknown'
  end
)
where target_type is null;

update public.reports
set target_id = coalesce(
  target_id,
  target_message_id,
  target_service_id,
  target_user_id
)
where target_id is null;

update public.reports
set reason_code = coalesce(
  nullif(trim(reason_code), ''),
  lower(regexp_replace(coalesce(reason, 'other'), '[^a-zA-Z0-9]+', '_', 'g'))
)
where reason_code is null or trim(reason_code) = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reports_status_check'
  ) then
    alter table public.reports
      add constraint reports_status_check
      check (status in ('open', 'in_review', 'resolved', 'dismissed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reports_target_type_check'
  ) then
    alter table public.reports
      add constraint reports_target_type_check
      check (
        target_type is null
        or target_type in (
          'user', 'service', 'message', 'conversation', 'organization',
          'news', 'gym_post', 'gym_video', 'unknown'
        )
      );
  end if;
end $$;

create unique index if not exists reports_idempotency_key_uidx
  on public.reports (idempotency_key)
  where idempotency_key is not null;

create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);

create index if not exists reports_target_idx
  on public.reports (target_type, target_id, created_at desc);

create index if not exists reports_assigned_idx
  on public.reports (assigned_admin_id, status)
  where assigned_admin_id is not null;

create table if not exists public.report_activity (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  actor_admin_id uuid references public.admin (id) on delete set null,
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists report_activity_report_idx
  on public.report_activity (report_id, created_at desc);
