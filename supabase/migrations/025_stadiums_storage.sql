-- Public stadium cover images bucket + admin write policies.
-- Run in SpoJex Supabase SQL editor. Safe to re-run.

insert into storage.buckets (id, name, public)
values ('stadiums', 'stadiums', true)
on conflict (id) do update set public = true;

drop policy if exists stadiums_storage_public_read on storage.objects;
create policy stadiums_storage_public_read on storage.objects
  for select
  using (bucket_id = 'stadiums');

drop policy if exists stadiums_storage_admin_insert on storage.objects;
create policy stadiums_storage_admin_insert on storage.objects
  for insert
  with check (
    bucket_id = 'stadiums'
    and public.is_spojex_admin()
  );

drop policy if exists stadiums_storage_admin_update on storage.objects;
create policy stadiums_storage_admin_update on storage.objects
  for update
  using (
    bucket_id = 'stadiums'
    and public.is_spojex_admin()
  )
  with check (
    bucket_id = 'stadiums'
    and public.is_spojex_admin()
  );

drop policy if exists stadiums_storage_admin_delete on storage.objects;
create policy stadiums_storage_admin_delete on storage.objects
  for delete
  using (
    bucket_id = 'stadiums'
    and public.is_spojex_admin()
  );

notify pgrst, 'reload schema';
