-- Organization gallery photos (max 6). First image is logo_url.
-- Path: {football_user_id}/{id}.jpg
-- Run in the live SQL editor after 069. Safe to re-run.

alter table public.organizations
  add column if not exists images jsonb not null default '[]'::jsonb;

alter table public.organizations
  drop constraint if exists organizations_images_max_6;
alter table public.organizations
  add constraint organizations_images_max_6
  check (
    jsonb_typeof(images) = 'array'
    and jsonb_array_length(images) <= 6
  );

update public.organizations
set images = jsonb_build_array(logo_url)
where coalesce(logo_url, '') <> ''
  and (images is null or images = '[]'::jsonb);

insert into storage.buckets (id, name, public)
values ('organization-covers', 'organization-covers', true)
on conflict (id) do update set public = true;

drop policy if exists organization_covers_public_read on storage.objects;
create policy organization_covers_public_read on storage.objects
  for select
  using (bucket_id = 'organization-covers');

drop policy if exists organization_covers_owner_insert on storage.objects;
create policy organization_covers_owner_insert on storage.objects
  for insert
  with check (
    bucket_id = 'organization-covers'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists organization_covers_owner_update on storage.objects;
create policy organization_covers_owner_update on storage.objects
  for update
  using (
    bucket_id = 'organization-covers'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  )
  with check (
    bucket_id = 'organization-covers'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists organization_covers_owner_delete on storage.objects;
create policy organization_covers_owner_delete on storage.objects
  for delete
  using (
    bucket_id = 'organization-covers'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

notify pgrst, 'reload schema';
