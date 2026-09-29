-- Public profile photos and highlight clips.
-- Path: {football_user_id}/photos/{id}.jpg  or  {football_user_id}/highlights/{id}.mp4
-- Run in the live SQL editor after 058. Safe to re-run.

insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do update set public = true;

create table if not exists public.profile_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('photo', 'highlight')),
  storage_path text not null unique,
  url text not null default '',
  mime_type text not null default 'image/jpeg',
  title text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists profile_media_user_kind_idx
  on public.profile_media (user_id, kind, sort_order, created_at desc);

create or replace function public.profile_media_enforce_limit()
returns trigger
language plpgsql
as $$
declare
  n integer;
begin
  select count(*) into n
  from public.profile_media
  where user_id = new.user_id
    and kind = new.kind;

  if new.kind = 'photo' and n >= 20 then
    raise exception 'photo_limit';
  end if;
  if new.kind = 'highlight' and n >= 8 then
    raise exception 'highlight_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_media_limit on public.profile_media;
create trigger profile_media_limit
  before insert on public.profile_media
  for each row execute function public.profile_media_enforce_limit();

alter table public.profile_media enable row level security;

drop policy if exists profile_media_select on public.profile_media;
create policy profile_media_select on public.profile_media
  for select using (true);

drop policy if exists profile_media_insert on public.profile_media;
create policy profile_media_insert on public.profile_media
  for insert with check (public.is_current_football_user(user_id));

drop policy if exists profile_media_update on public.profile_media;
create policy profile_media_update on public.profile_media
  for update
  using (public.is_current_football_user(user_id))
  with check (public.is_current_football_user(user_id));

drop policy if exists profile_media_delete on public.profile_media;
create policy profile_media_delete on public.profile_media
  for delete using (public.is_current_football_user(user_id));

grant select on public.profile_media to anon, authenticated;
grant insert, update, delete on public.profile_media to authenticated;

drop policy if exists profile_media_public_read on storage.objects;
create policy profile_media_public_read on storage.objects
  for select
  using (bucket_id = 'profile-media');

drop policy if exists profile_media_owner_insert on storage.objects;
create policy profile_media_owner_insert on storage.objects
  for insert
  with check (
    bucket_id = 'profile-media'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists profile_media_owner_update on storage.objects;
create policy profile_media_owner_update on storage.objects
  for update
  using (
    bucket_id = 'profile-media'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  )
  with check (
    bucket_id = 'profile-media'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists profile_media_owner_delete on storage.objects;
create policy profile_media_owner_delete on storage.objects
  for delete
  using (
    bucket_id = 'profile-media'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

notify pgrst, 'reload schema';
