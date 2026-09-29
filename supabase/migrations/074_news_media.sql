-- Sport news video and audio. Public read, admin write via sport-news bucket.
-- Safe to re-run.

alter table public.sport_news
  add column if not exists video_url text not null default '';
alter table public.sport_news
  add column if not exists audio_url text not null default '';

insert into storage.buckets (id, name, public)
values ('sport-news', 'sport-news', true)
on conflict (id) do update set public = true;

drop policy if exists sport_news_storage_public_read on storage.objects;
create policy sport_news_storage_public_read on storage.objects
  for select
  using (bucket_id = 'sport-news');

drop policy if exists sport_news_storage_admin_insert on storage.objects;
create policy sport_news_storage_admin_insert on storage.objects
  for insert
  with check (
    bucket_id = 'sport-news'
    and public.is_spojex_admin()
  );

drop policy if exists sport_news_storage_admin_update on storage.objects;
create policy sport_news_storage_admin_update on storage.objects
  for update
  using (
    bucket_id = 'sport-news'
    and public.is_spojex_admin()
  )
  with check (
    bucket_id = 'sport-news'
    and public.is_spojex_admin()
  );

drop policy if exists sport_news_storage_admin_delete on storage.objects;
create policy sport_news_storage_admin_delete on storage.objects
  for delete
  using (
    bucket_id = 'sport-news'
    and public.is_spojex_admin()
  );

notify pgrst, 'reload schema';
