-- Public gym logo/cover images bucket + admin write policies.
-- Run in SpoJex Supabase SQL editor. Safe to re-run.

insert into storage.buckets (id, name, public)
values ('gyms', 'gyms', true)
on conflict (id) do update set public = true;

drop policy if exists gyms_storage_public_read on storage.objects;
create policy gyms_storage_public_read on storage.objects
  for select
  using (bucket_id = 'gyms');

drop policy if exists gyms_storage_admin_insert on storage.objects;
create policy gyms_storage_admin_insert on storage.objects
  for insert
  with check (
    bucket_id = 'gyms'
    and public.is_spojex_admin()
  );

drop policy if exists gyms_storage_admin_update on storage.objects;
create policy gyms_storage_admin_update on storage.objects
  for update
  using (
    bucket_id = 'gyms'
    and public.is_spojex_admin()
  )
  with check (
    bucket_id = 'gyms'
    and public.is_spojex_admin()
  );

drop policy if exists gyms_storage_admin_delete on storage.objects;
create policy gyms_storage_admin_delete on storage.objects
  for delete
  using (
    bucket_id = 'gyms'
    and public.is_spojex_admin()
  );

notify pgrst, 'reload schema';
