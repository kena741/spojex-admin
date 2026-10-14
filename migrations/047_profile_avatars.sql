-- Public profile photos. Path: {football_user_id}/avatar.jpg
-- Run after 046_send_chat_message.sql. Safe to re-run.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

notify pgrst, 'reload schema';
