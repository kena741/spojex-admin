-- List the signed-in user's direct chats without client-side membership scans.
-- Safe to re-run after 049_accepted_request_to_chats.sql.

grant select on table public.conversations to authenticated;
grant select on table public.conversation_members to authenticated;
grant select on table public.messages to authenticated;

create or replace function public.chat_inbox()
returns table (
  id uuid,
  type text,
  state text,
  title text,
  last_message_at timestamptz,
  last_message_preview text,
  created_by uuid,
  unread_count integer,
  other_id uuid,
  other_display_name text,
  other_role text,
  other_avatar_url text,
  other_headline text,
  first_sender_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select public.current_football_user_id() as id
  )
  select
    c.id,
    c.type,
    c.state,
    c.title,
    coalesce(c.last_message_at, latest.created_at) as last_message_at,
    coalesce(
      nullif(c.last_message_preview, ''),
      left(coalesce(latest.body, ''), 140)
    ) as last_message_preview,
    c.created_by,
    coalesce(mine.unread_count, 0) as unread_count,
    peer.user_id as other_id,
    u.display_name as other_display_name,
    u.role as other_role,
    u.avatar_url as other_avatar_url,
    u.headline as other_headline,
    first.sender_id as first_sender_id
  from me
  join public.conversation_members mine
    on mine.user_id = me.id
   and mine.hidden is not true
  join public.conversations c
    on c.id = mine.conversation_id
  left join lateral (
    select m.user_id
    from public.conversation_members m
    where m.conversation_id = c.id
      and m.user_id is distinct from me.id
    limit 1
  ) peer on true
  left join public.users u on u.id = peer.user_id
  left join lateral (
    select msg.body, msg.created_at
    from public.messages msg
    where msg.conversation_id = c.id
      and msg.type <> 'system'
      and msg.deleted_at is null
    order by msg.created_at desc
    limit 1
  ) latest on true
  left join lateral (
    select msg.sender_id
    from public.messages msg
    where msg.conversation_id = c.id
      and msg.type <> 'system'
      and msg.deleted_at is null
      and msg.sender_id is not null
    order by msg.created_at
    limit 1
  ) first on true
  where me.id is not null
    and c.type = 'direct'
    and c.state in ('request', 'active')
  order by coalesce(c.last_message_at, latest.created_at) desc nulls last;
$$;

grant execute on function public.chat_inbox() to authenticated;

notify pgrst, 'reload schema';
