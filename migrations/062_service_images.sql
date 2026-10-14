-- Extra listing photos. Cover stays in cover_url (first image).
-- Run after 061_service_covers.sql. Safe to re-run.

alter table public.services
  add column if not exists images jsonb not null default '[]'::jsonb;

update public.services
set images = jsonb_build_array(cover_url)
where coalesce(cover_url, '') <> ''
  and (images is null or images = '[]'::jsonb);
