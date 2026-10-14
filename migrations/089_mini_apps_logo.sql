-- Mini app logos: column + public storage bucket for admin uploads.
-- Run after 052_mini_apps.sql. Safe to re-run.

alter table public.mini_apps
  add column if not exists logo_url text not null default '';

insert into storage.buckets (id, name, public)
values ('mini-apps', 'mini-apps', true)
on conflict (id) do update set public = true;

drop policy if exists mini_apps_storage_public_read on storage.objects;
create policy mini_apps_storage_public_read on storage.objects
  for select
  using (bucket_id = 'mini-apps');

drop policy if exists mini_apps_storage_admin_insert on storage.objects;
create policy mini_apps_storage_admin_insert on storage.objects
  for insert
  with check (
    bucket_id = 'mini-apps'
    and public.is_spojex_admin()
  );

drop policy if exists mini_apps_storage_admin_update on storage.objects;
create policy mini_apps_storage_admin_update on storage.objects
  for update
  using (
    bucket_id = 'mini-apps'
    and public.is_spojex_admin()
  )
  with check (
    bucket_id = 'mini-apps'
    and public.is_spojex_admin()
  );

drop policy if exists mini_apps_storage_admin_delete on storage.objects;
create policy mini_apps_storage_admin_delete on storage.objects
  for delete
  using (
    bucket_id = 'mini-apps'
    and public.is_spojex_admin()
  );

notify pgrst, 'reload schema';
