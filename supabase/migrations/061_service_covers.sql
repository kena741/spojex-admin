-- Public cover photos for marketplace listings.
-- Path: {football_user_id}/{id}.jpg
-- Run in the live SQL editor after 060. Safe to re-run.

insert into storage.buckets (id, name, public)
values ('service-covers', 'service-covers', true)
on conflict (id) do update set public = true;

drop policy if exists service_covers_public_read on storage.objects;
create policy service_covers_public_read on storage.objects
  for select
  using (bucket_id = 'service-covers');

drop policy if exists service_covers_owner_insert on storage.objects;
create policy service_covers_owner_insert on storage.objects
  for insert
  with check (
    bucket_id = 'service-covers'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists service_covers_owner_update on storage.objects;
create policy service_covers_owner_update on storage.objects
  for update
  using (
    bucket_id = 'service-covers'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  )
  with check (
    bucket_id = 'service-covers'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists service_covers_owner_delete on storage.objects;
create policy service_covers_owner_delete on storage.objects
  for delete
  using (
    bucket_id = 'service-covers'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );
