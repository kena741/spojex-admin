-- Saved people / orgs / services on football users.id (profiles.saved_items died in 006).
-- Chat media readable by conversation peers, not only the uploader.
-- Safe to re-run after 054_service_reviews.sql.

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  target_user_id uuid references public.users (id) on delete cascade,
  target_organization_id uuid references public.organizations (id) on delete cascade,
  target_service_id uuid references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_items_one_target check (
    (target_user_id is not null)::int
    + (target_organization_id is not null)::int
    + (target_service_id is not null)::int
    = 1
  )
);

create unique index if not exists saved_items_user_target_user_uniq
  on public.saved_items (user_id, target_user_id)
  where target_user_id is not null;

create unique index if not exists saved_items_user_target_org_uniq
  on public.saved_items (user_id, target_organization_id)
  where target_organization_id is not null;

create unique index if not exists saved_items_user_target_service_uniq
  on public.saved_items (user_id, target_service_id)
  where target_service_id is not null;

alter table public.saved_items enable row level security;

drop policy if exists saved_items_select on public.saved_items;
create policy saved_items_select on public.saved_items
  for select using (public.is_current_football_user(user_id));

drop policy if exists saved_items_insert on public.saved_items;
create policy saved_items_insert on public.saved_items
  for insert with check (public.is_current_football_user(user_id));

drop policy if exists saved_items_delete on public.saved_items;
create policy saved_items_delete on public.saved_items
  for delete using (public.is_current_football_user(user_id));

grant select, insert, delete on public.saved_items to authenticated;

drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects
  for select
  using (
    bucket_id = 'chat-media'
    and (
      split_part(name, '/', 1) = public.current_football_user_id()::text
      or exists (
        select 1
        from public.messages m
        join public.conversation_members cm
          on cm.conversation_id = m.conversation_id
        where m.deleted_at is null
          and m.media_path <> ''
          and (
            m.media_path = name
            or m.media_path = 'chat-media/' || name
          )
          and public.is_current_football_user(cm.user_id)
      )
    )
  );
