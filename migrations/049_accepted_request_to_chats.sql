-- After a message request is accepted, keep the original message and
-- move the thread into the main chats inbox (state = active).
-- Safe to re-run after 048_message_request_sender.sql.

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
  v_requester uuid;
  v_preview text;
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

  if not exists (
    select 1 from public.conversation_members m
    where m.conversation_id = v_conv.id and m.user_id = v_me
  ) then
    raise exception 'Conversation not found.';
  end if;

  v_requester := public.conversation_request_sender(v_conv.id);
  if v_requester is not null and v_requester = v_me then
    raise exception 'Wait for the other person to respond.';
  end if;
  if v_requester is null and v_conv.created_by = v_me then
    raise exception 'Wait for the other person to respond.';
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

  select left(coalesce(nullif(m.body, ''), 'Message'), 140)
  into v_preview
  from public.messages m
  where m.conversation_id = v_conv.id
    and m.type <> 'system'
    and m.deleted_at is null
  order by m.created_at desc
  limit 1;

  update public.conversations
  set state = 'active',
      last_message_at = now(),
      last_message_preview = coalesce(
        nullif(last_message_preview, ''),
        v_preview,
        ''
      )
  where id = v_conv.id;

  update public.conversation_members
  set hidden = false
  where conversation_id = v_conv.id;

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
    jsonb_build_object(
      'conversation_id', v_conv.id,
      'from_user_id', v_me
    )
  );

  return v_conv.id;
end;
$$;

notify pgrst, 'reload schema';
