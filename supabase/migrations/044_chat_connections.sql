-- Unified Chat & Connection system (Phase 1: connections + direct messaging).
-- Identity is public.users.id (football profile), not auth.uid().
-- Group/org/team conversation types are in the schema for later phases.
-- Run after 043_donation_chapa.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_football_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.id from public.users u where u.user_id = auth.uid() limit 1),
    (select u.id from public.users u where u.id = auth.uid() limit 1)
  );
$$;

grant execute on function public.current_football_user_id() to authenticated;

create or replace function public.direct_pair_key(a uuid, b uuid)
returns text
language sql
immutable
as $$
  select case
    when a < b then a::text || ':' || b::text
    else b::text || ':' || a::text
  end;
$$;

grant execute on function public.direct_pair_key(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Replace 001 network/chat tables (they FKed profiles/auth.uid())
-- ---------------------------------------------------------------------------

drop table if exists public.messages cascade;
drop table if exists public.conversation_participants cascade;
drop table if exists public.conversations cascade;
drop table if exists public.connection_requests cascade;
drop table if exists public.connections cascade;
drop table if exists public.notifications cascade;
drop table if exists public.blocks cascade;
drop table if exists public.reports cascade;
drop table if exists public.follows cascade;

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------

create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users (id) on delete cascade,
  addressee_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index connection_requests_pending_pair_idx
  on public.connection_requests (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  )
  where status = 'pending';

create index connection_requests_addressee_idx
  on public.connection_requests (addressee_id, created_at desc)
  where status = 'pending';

create index connection_requests_requester_idx
  on public.connection_requests (requester_id, created_at desc);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.users (id) on delete cascade,
  user_b uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b)
);

create unique index connections_pair_idx on public.connections (user_a, user_b);
create index connections_user_b_idx on public.connections (user_b);

create table public.blocks (
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.follows (
  follower_id uuid not null references public.users (id) on delete cascade,
  following_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users (id) on delete cascade,
  target_user_id uuid references public.users (id) on delete set null,
  target_service_id uuid,
  reason text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Conversations + members + messages
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'direct'
    check (type in ('direct', 'group', 'organization', 'team')),
  state text not null default 'active'
    check (state in ('request', 'active', 'declined', 'archived')),
  title text not null default '',
  organization_id uuid references public.organizations (id) on delete set null,
  team_id uuid,
  created_by uuid references public.users (id) on delete set null,
  direct_key text,
  last_message_at timestamptz,
  last_message_preview text not null default '',
  created_at timestamptz not null default now()
);

create unique index conversations_direct_key_idx
  on public.conversations (direct_key)
  where direct_key is not null;

create index conversations_org_idx
  on public.conversations (organization_id)
  where organization_id is not null;

create index conversations_last_message_idx
  on public.conversations (last_message_at desc nulls last);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  member_role text not null default 'member'
    check (member_role in ('owner', 'admin', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  unread_count integer not null default 0,
  muted boolean not null default false,
  hidden boolean not null default false,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx
  on public.conversation_members (user_id, hidden);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.users (id) on delete set null,
  type text not null default 'text'
    check (type in ('text', 'image', 'video', 'file', 'audio', 'profile', 'system')),
  body text not null default '',
  media_path text not null default '',
  media_mime text not null default '',
  reply_to_id uuid references public.messages (id) on delete set null,
  shared_profile_id uuid references public.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx
  on public.messages (conversation_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null
    check (kind in (
      'connection_request',
      'connection_accepted',
      'message',
      'message_request',
      'group_invite',
      'group_added',
      'group_removed'
    )),
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Auth helpers used by RLS
-- ---------------------------------------------------------------------------

create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.connections c
    where c.user_a = least(a, b)
      and c.user_b = greatest(a, b)
  );
$$;

create or replace function public.is_blocked_either(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  );
$$;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members m
    where m.conversation_id = p_conversation_id
      and public.is_current_football_user(m.user_id)
  );
$$;

grant execute on function public.are_connected(uuid, uuid) to authenticated;
grant execute on function public.is_blocked_either(uuid, uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;

create or replace function public._notify_user(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, kind, title, body, payload)
  values (
    p_user_id,
    p_kind,
    p_title,
    coalesce(p_body, ''),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

create or replace function public._ensure_direct_conversation(
  p_a uuid,
  p_b uuid,
  p_state text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := public.direct_pair_key(p_a, p_b);
  v_id uuid;
begin
  select id into v_id
  from public.conversations
  where direct_key = v_key
  limit 1;

  if v_id is not null then
    if p_state = 'active' then
      update public.conversations
      set state = 'active'
      where id = v_id
        and state <> 'archived';
    end if;

    insert into public.conversation_members (conversation_id, user_id, member_role)
    values (v_id, p_a, 'owner')
    on conflict do nothing;
    insert into public.conversation_members (conversation_id, user_id, member_role)
    values (v_id, p_b, 'member')
    on conflict do nothing;

    return v_id;
  end if;

  insert into public.conversations (type, state, created_by, direct_key)
  values ('direct', p_state, p_a, v_key)
  returning id into v_id;

  insert into public.conversation_members (conversation_id, user_id, member_role)
  values (v_id, p_a, 'owner'), (v_id, p_b, 'member');

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.request_connection(p_addressee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_id uuid;
  v_name text;
begin
  if v_me is null then
    raise exception 'Sign in to connect.';
  end if;
  if p_addressee_id is null or p_addressee_id = v_me then
    raise exception 'You cannot connect with this user.';
  end if;
  if not exists (select 1 from public.users u where u.id = p_addressee_id) then
    raise exception 'User not found.';
  end if;
  if public.is_blocked_either(v_me, p_addressee_id) then
    raise exception 'You cannot connect with this user.';
  end if;
  if public.are_connected(v_me, p_addressee_id) then
    select cr.id into v_id
    from public.connection_requests cr
    where cr.status = 'accepted'
      and least(cr.requester_id, cr.addressee_id) = least(v_me, p_addressee_id)
      and greatest(cr.requester_id, cr.addressee_id) = greatest(v_me, p_addressee_id)
    order by cr.created_at desc
    limit 1;
    return v_id;
  end if;

  select cr.id into v_id
  from public.connection_requests cr
  where cr.status = 'pending'
    and cr.requester_id = p_addressee_id
    and cr.addressee_id = v_me;
  if v_id is not null then
    perform public.respond_connection_request(v_id, 'accept');
    return v_id;
  end if;

  select cr.id into v_id
  from public.connection_requests cr
  where cr.status = 'pending'
    and cr.requester_id = v_me
    and cr.addressee_id = p_addressee_id;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.connection_requests (requester_id, addressee_id)
  values (v_me, p_addressee_id)
  returning id into v_id;

  select coalesce(nullif(display_name, ''), 'Someone') into v_name
  from public.users
  where id = v_me;

  perform public._notify_user(
    p_addressee_id,
    'connection_request',
    'New connection request',
    v_name || ' wants to connect',
    jsonb_build_object('request_id', v_id, 'from_user_id', v_me)
  );

  return v_id;
end;
$$;

create or replace function public.respond_connection_request(
  p_request_id uuid,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_req public.connection_requests%rowtype;
  v_other uuid;
  v_name text;
  v_conversation uuid;
begin
  if v_me is null then
    raise exception 'Sign in to respond.';
  end if;
  if p_action not in ('accept', 'decline', 'block') then
    raise exception 'Invalid action.';
  end if;

  select * into v_req
  from public.connection_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found.';
  end if;
  if v_req.status <> 'pending' then
    return v_req.id;
  end if;
  if v_req.addressee_id <> v_me and not (p_action = 'decline' and v_req.requester_id = v_me) then
    raise exception 'You cannot respond to this request.';
  end if;

  v_other := case when v_req.requester_id = v_me then v_req.addressee_id else v_req.requester_id end;

  if p_action = 'block' then
    update public.connection_requests
    set status = 'declined', responded_at = now()
    where id = v_req.id;
    perform public.block_user(v_other);
    return v_req.id;
  end if;

  if p_action = 'decline' then
    update public.connection_requests
    set status = 'declined', responded_at = now()
    where id = v_req.id;
    return v_req.id;
  end if;

  update public.connection_requests
  set status = 'accepted', responded_at = now()
  where id = v_req.id;

  insert into public.connections (user_a, user_b)
  values (least(v_req.requester_id, v_req.addressee_id), greatest(v_req.requester_id, v_req.addressee_id))
  on conflict do nothing;

  v_conversation := public._ensure_direct_conversation(
    v_req.requester_id,
    v_req.addressee_id,
    'active'
  );

  select coalesce(nullif(display_name, ''), 'Someone') into v_name
  from public.users
  where id = v_me;

  perform public._notify_user(
    v_req.requester_id,
    'connection_accepted',
    'Request accepted',
    v_name || ' accepted your connection request',
    jsonb_build_object(
      'request_id', v_req.id,
      'from_user_id', v_me,
      'conversation_id', v_conversation
    )
  );

  return v_req.id;
end;
$$;

create or replace function public.open_direct_conversation(p_other_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_state text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Sign in to message.';
  end if;
  if p_other_id is null or p_other_id = v_me then
    raise exception 'You cannot message this user.';
  end if;
  if not exists (select 1 from public.users u where u.id = p_other_id) then
    raise exception 'User not found.';
  end if;
  if public.is_blocked_either(v_me, p_other_id) then
    raise exception 'You cannot message this user.';
  end if;

  select c.id, c.state into v_id, v_state
  from public.conversations c
  where c.direct_key = public.direct_pair_key(v_me, p_other_id)
  limit 1;

  if v_id is not null then
    if v_state = 'declined' then
      raise exception 'This message request was declined.';
    end if;
    if v_state = 'archived' then
      raise exception 'You cannot message this user.';
    end if;
    return v_id;
  end if;

  v_state := case when public.are_connected(v_me, p_other_id) then 'active' else 'request' end;
  return public._ensure_direct_conversation(v_me, p_other_id, v_state);
end;
$$;

create or replace function public.respond_message_request(
  p_conversation_id uuid,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_conv public.conversations%rowtype;
  v_other uuid;
  v_name text;
begin
  if v_me is null then
    raise exception 'Sign in to respond.';
  end if;
  if p_action not in ('accept', 'decline', 'block') then
    raise exception 'Invalid action.';
  end if;

  select * into v_conv
  from public.conversations
  where id = p_conversation_id
  for update;

  if not found or v_conv.type <> 'direct' then
    raise exception 'Conversation not found.';
  end if;
  if v_conv.state <> 'request' then
    return v_conv.id;
  end if;
  if v_conv.created_by = v_me then
    raise exception 'Wait for the other person to respond.';
  end if;
  if not exists (
    select 1 from public.conversation_members m
    where m.conversation_id = v_conv.id and m.user_id = v_me
  ) then
    raise exception 'Conversation not found.';
  end if;

  select m.user_id into v_other
  from public.conversation_members m
  where m.conversation_id = v_conv.id
    and m.user_id <> v_me
  limit 1;

  if p_action = 'block' then
    update public.conversations set state = 'declined' where id = v_conv.id;
    perform public.block_user(v_other);
    return v_conv.id;
  end if;

  if p_action = 'decline' then
    update public.conversations set state = 'declined' where id = v_conv.id;
    return v_conv.id;
  end if;

  update public.conversations set state = 'active' where id = v_conv.id;

  insert into public.connections (user_a, user_b)
  values (least(v_me, v_other), greatest(v_me, v_other))
  on conflict do nothing;

  update public.connection_requests
  set status = 'accepted', responded_at = now()
  where status = 'pending'
    and least(requester_id, addressee_id) = least(v_me, v_other)
    and greatest(requester_id, addressee_id) = greatest(v_me, v_other);

  select coalesce(nullif(display_name, ''), 'Someone') into v_name
  from public.users
  where id = v_me;

  perform public._notify_user(
    v_other,
    'connection_accepted',
    'Request accepted',
    v_name || ' accepted your message request',
    jsonb_build_object('conversation_id', v_conv.id, 'from_user_id', v_me)
  );

  return v_conv.id;
end;
$$;

create or replace function public.block_user(p_other_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_key text;
begin
  if v_me is null then
    raise exception 'Sign in to block.';
  end if;
  if p_other_id is null or p_other_id = v_me then
    raise exception 'You cannot block this user.';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_me, p_other_id)
  on conflict do nothing;

  update public.connection_requests
  set status = 'cancelled', responded_at = now()
  where status = 'pending'
    and (
      (requester_id = v_me and addressee_id = p_other_id)
      or (requester_id = p_other_id and addressee_id = v_me)
    );

  v_key := public.direct_pair_key(v_me, p_other_id);
  update public.conversations
  set state = 'archived'
  where direct_key = v_key;

  update public.conversation_members m
  set hidden = true
  from public.conversations c
  where m.conversation_id = c.id
    and c.direct_key = v_key
    and m.user_id = v_me;
end;
$$;

grant execute on function public.request_connection(uuid) to authenticated;
grant execute on function public.respond_connection_request(uuid, text) to authenticated;
grant execute on function public.open_direct_conversation(uuid) to authenticated;
grant execute on function public.respond_message_request(uuid, text) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Message side effects
-- ---------------------------------------------------------------------------

create or replace function public.tg_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview text;
  v_member record;
  v_sender_name text;
  v_kind text;
  v_state text;
begin
  v_preview := case
    when new.deleted_at is not null then 'Message deleted'
    when new.type = 'image' then 'Photo'
    when new.type = 'video' then 'Video'
    when new.type = 'audio' then 'Voice message'
    when new.type = 'file' then 'File'
    when new.type = 'profile' then 'Shared a profile'
    when new.type = 'system' then coalesce(nullif(new.body, ''), 'Update')
    else left(coalesce(new.body, ''), 140)
  end;

  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = coalesce(v_preview, '')
  where id = new.conversation_id;

  if new.type = 'system' then
    return new;
  end if;

  update public.conversation_members
  set unread_count = unread_count + 1
  where conversation_id = new.conversation_id
    and user_id is distinct from new.sender_id;

  select coalesce(nullif(display_name, ''), 'Someone') into v_sender_name
  from public.users
  where id = new.sender_id;

  select state into v_state
  from public.conversations
  where id = new.conversation_id;

  v_kind := case when v_state = 'request' then 'message_request' else 'message' end;

  for v_member in
    select user_id
    from public.conversation_members
    where conversation_id = new.conversation_id
      and user_id is distinct from new.sender_id
      and hidden = false
  loop
    perform public._notify_user(
      v_member.user_id,
      v_kind,
      case when v_kind = 'message_request' then 'Message request' else 'New message' end,
      v_sender_name || ': ' || coalesce(v_preview, ''),
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'message_id', new.id,
        'from_user_id', new.sender_id
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.tg_messages_after_insert();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.connection_requests enable row level security;
alter table public.connections enable row level security;
alter table public.blocks enable row level security;
alter table public.follows enable row level security;
alter table public.reports enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

drop policy if exists connection_requests_select on public.connection_requests;
create policy connection_requests_select on public.connection_requests
  for select using (
    public.is_current_football_user(requester_id)
    or public.is_current_football_user(addressee_id)
  );

drop policy if exists connections_select on public.connections;
create policy connections_select on public.connections
  for select using (
    public.is_current_football_user(user_a)
    or public.is_current_football_user(user_b)
  );

drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks
  for select using (
    public.is_current_football_user(blocker_id)
  );

drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks
  for insert with check (public.is_current_football_user(blocker_id));

drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks
  for delete using (public.is_current_football_user(blocker_id));

drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows
  for select using (true);

drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows
  for insert with check (public.is_current_football_user(follower_id));

drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows
  for delete using (public.is_current_football_user(follower_id));

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert with check (public.is_current_football_user(reporter_id));

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select using (public.is_current_football_user(reporter_id));

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (public.is_conversation_member(id));

drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select using (public.is_conversation_member(conversation_id));

drop policy if exists conversation_members_update on public.conversation_members;
create policy conversation_members_update on public.conversation_members
  for update using (public.is_current_football_user(user_id))
  with check (public.is_current_football_user(user_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.is_conversation_member(conversation_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    public.is_current_football_user(sender_id)
    and public.is_conversation_member(conversation_id)
    and not exists (
      select 1
      from public.conversation_members m
      where m.conversation_id = messages.conversation_id
        and m.user_id <> sender_id
        and public.is_blocked_either(sender_id, m.user_id)
    )
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.state in ('request', 'active')
        and (
          c.state = 'active'
          or c.created_by = sender_id
        )
    )
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update using (public.is_current_football_user(sender_id))
  with check (public.is_current_football_user(sender_id));

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (public.is_current_football_user(user_id));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (public.is_current_football_user(user_id))
  with check (public.is_current_football_user(user_id));

-- ---------------------------------------------------------------------------
-- Storage (media paths live here; messages store media_path only)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do update set public = false;

drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects
  for insert
  with check (
    bucket_id = 'chat-media'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists chat_media_update on storage.objects;
create policy chat_media_update on storage.objects
  for update
  using (
    bucket_id = 'chat-media'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  )
  with check (
    bucket_id = 'chat-media'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_delete on storage.objects
  for delete
  using (
    bucket_id = 'chat-media'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects
  for select
  using (
    bucket_id = 'chat-media'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter table public.messages replica identity full;
alter table public.conversations replica identity full;
alter table public.connection_requests replica identity full;
alter table public.notifications replica identity full;
alter table public.conversation_members replica identity full;

do $$
begin
  execute 'alter publication supabase_realtime add table public.messages';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.conversations';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.connection_requests';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.notifications';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.conversation_members';
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
