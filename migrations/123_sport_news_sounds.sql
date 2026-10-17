-- Sport news sound library: reusable tracks for image posts.
-- Keep in sync with spojex_backend alembic a1spojex000033.

create table if not exists public.sport_news_sounds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'general',
  audio_url text not null default '',
  duration_seconds integer,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sport_news_sounds_kind_check check (
    kind in (
      'general',
      'stadium',
      'crowd',
      'whistle',
      'anthem',
      'highlight',
      'training',
      'ambient'
    )
  )
);

create index if not exists sport_news_sounds_active_sort_idx
  on public.sport_news_sounds (is_active, sort_order, name);

alter table public.sport_news
  add column if not exists sound_id uuid
    references public.sport_news_sounds (id)
    on delete set null;

create index if not exists sport_news_sound_id_idx
  on public.sport_news (sound_id)
  where sound_id is not null;

comment on table public.sport_news_sounds is
  'Admin-managed sport sound library for image news soundtracks.';
comment on column public.sport_news.sound_id is
  'Optional library sound for image posts (audio_url mirrors the track URL).';

notify pgrst, 'reload schema';
