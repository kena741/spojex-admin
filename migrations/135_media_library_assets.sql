-- Media Library asset registry + usage references (no duplicate GCS storage).
-- Mirror of Alembic a1spojex000067.

create table if not exists public.media_library_assets (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('image', 'video', 'sound')),
  display_name text not null default '',
  description text not null default '',
  sound_category text,
  organization_id uuid references public.organizations (id) on delete set null,
  media_object_id uuid references public.media_objects (id) on delete set null,
  sound_id uuid references public.sport_news_sounds (id) on delete set null,
  storage_key text not null,
  delivery_url text not null default '',
  mime_type text not null default '',
  byte_size bigint,
  duration_seconds double precision,
  width integer,
  height integer,
  status text not null default 'ready'
    check (status in ('ready', 'processing', 'failed', 'hidden', 'trashed')),
  parent_asset_id uuid references public.media_library_assets (id) on delete set null,
  transform_metadata jsonb not null default '{}'::jsonb,
  attribution text not null default '',
  created_by_admin_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trashed_at timestamptz,
  constraint media_library_assets_storage_key_key unique (storage_key)
);

create unique index if not exists media_library_assets_sound_id_uidx
  on public.media_library_assets (sound_id)
  where sound_id is not null;

create index if not exists media_library_assets_type_status_idx
  on public.media_library_assets (media_type, status, created_at desc);

create index if not exists media_library_assets_org_idx
  on public.media_library_assets (organization_id, created_at desc)
  where organization_id is not null;

create index if not exists media_library_assets_object_idx
  on public.media_library_assets (media_object_id)
  where media_object_id is not null;

create table if not exists public.media_asset_usages (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_library_assets (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  field_name text not null default '',
  label text not null default '',
  href text not null default '',
  created_at timestamptz not null default now(),
  constraint media_asset_usages_unique
    unique (asset_id, entity_type, entity_id, field_name)
);

create index if not exists media_asset_usages_entity_idx
  on public.media_asset_usages (entity_type, entity_id);

create index if not exists media_asset_usages_asset_idx
  on public.media_asset_usages (asset_id);

comment on table public.media_library_assets is
  'Catalog overlay on media_objects / sport_news_sounds. Storage stays in GCS.';
comment on table public.media_asset_usages is
  'Explicit asset→content references. Coverage is incremental — unused only when indexed.';

-- Link sounds table to optional media_object when column missing
alter table public.sport_news_sounds
  add column if not exists media_object_id uuid references public.media_objects (id) on delete set null;

alter table public.sport_news_sounds
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

alter table public.sport_news_sounds
  add column if not exists attribution text not null default '';
