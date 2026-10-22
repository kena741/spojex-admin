-- Sport News admin hardening (mirror of Alembic a1spojex000065).
-- Primary media type, soundtrack flag, archive timestamp; clear featured on archived.

alter table public.sport_news
  add column if not exists media_type text;

alter table public.sport_news
  add column if not exists has_soundtrack boolean not null default false;

alter table public.sport_news
  add column if not exists archived_at timestamptz;

alter table public.sport_news
  add column if not exists last_edited_by_admin_id uuid;

comment on column public.sport_news.media_type is
  'Primary type: text|image|gallery|video|audio. Image+music is image/gallery with has_soundtrack.';
comment on column public.sport_news.has_soundtrack is
  'True when image/gallery story has background audio. Not a primary audio story.';
comment on column public.sport_news.archived_at is
  'When the story entered archived status. published_at is preserved.';

create index if not exists sport_news_status_published_at_idx
  on public.sport_news (status, published_at desc nulls last);

create index if not exists sport_news_media_type_idx
  on public.sport_news (media_type)
  where media_type is not null;

create index if not exists sport_news_organization_id_idx
  on public.sport_news (organization_id);

update public.sport_news n set
  media_type = case
    when nullif(trim(coalesce(n.video_url, '')), '') is not null then 'video'
    when nullif(trim(coalesce(n.image_url, '')), '') is not null
      or nullif(trim(coalesce(n.cover_url, '')), '') is not null
      or coalesce(jsonb_array_length(coalesce(n.image_urls, '[]'::jsonb)), 0) > 0
    then case
      when coalesce(jsonb_array_length(coalesce(n.image_urls, '[]'::jsonb)), 0) > 1
      then 'gallery' else 'image' end
    when nullif(trim(coalesce(n.audio_url, '')), '') is not null
      or n.sound_id is not null then 'audio'
    else 'text'
  end,
  has_soundtrack = (
    (
      nullif(trim(coalesce(n.image_url, '')), '') is not null
      or nullif(trim(coalesce(n.cover_url, '')), '') is not null
      or coalesce(jsonb_array_length(coalesce(n.image_urls, '[]'::jsonb)), 0) > 0
    )
    and nullif(trim(coalesce(n.video_url, '')), '') is null
    and (
      nullif(trim(coalesce(n.audio_url, '')), '') is not null
      or n.sound_id is not null
    )
  ),
  archived_at = case
    when lower(n.status) in ('archived', 'archive', 'hidden')
      then coalesce(n.archived_at, n.updated_at, n.created_at)
    else n.archived_at
  end,
  is_featured = case
    when lower(n.status) in ('archived', 'archive', 'hidden') then false
    else n.is_featured
  end
where n.media_type is null
   or lower(n.status) in ('archived', 'archive', 'hidden');
