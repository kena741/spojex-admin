-- Stadium admin hardening (mirror of Alembic a1spojex000059).
-- Prefer API Alembic deploy path.

alter table public.stadiums
  add column if not exists external_id text;
alter table public.stadiums
  add column if not exists import_source text;
alter table public.stadiums
  add column if not exists imported_at timestamptz;
alter table public.stadiums
  add column if not exists location_review_needed boolean not null default false;

create unique index if not exists stadiums_external_id_uidx
  on public.stadiums (external_id)
  where external_id is not null and external_id <> '';
