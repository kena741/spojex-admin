-- First message to a non-connection is a request.
-- Sender may send only that one message until the recipient accepts.

create or replace function public.tg_messages_limit_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state text;
  v_created_by uuid;
  v_count int;
begin
  if new.type = 'system' then
    return new;
  end if;

  select c.state, c.created_by into v_state, v_created_by
  from public.conversations c
  where c.id = new.conversation_id;

  if v_state is null then
    raise exception 'Conversation not found.';
  end if;

  if v_state not in ('request', 'active') then
    raise exception 'You cannot send messages in this chat.';
  end if;

  if v_state = 'active' then
    return new;
  end if;

  if new.sender_id is distinct from v_created_by then
    raise exception 'Accept the message request to reply.';
  end if;

  select count(*)::int into v_count
  from public.messages m
  where m.conversation_id = new.conversation_id
    and m.sender_id = new.sender_id
    and m.type <> 'system'
    and m.deleted_at is null;

  if coalesce(v_count, 0) >= 1 then
    raise exception 'Wait until they accept your message request.';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_limit_request on public.messages;
create trigger messages_limit_request
  before insert on public.messages
  for each row execute function public.tg_messages_limit_request();

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
        and (
          c.state = 'active'
          or (
            c.state = 'request'
            and c.created_by = sender_id
            and (
              select count(*)
              from public.messages m
              where m.conversation_id = conversation_id
                and m.sender_id = sender_id
                and m.type <> 'system'
                and m.deleted_at is null
            ) < 1
          )
        )
    )
  );

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
  v_other uuid;
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

  if v_state = 'request' and new.type <> 'system' then
    select m.user_id into v_other
    from public.conversation_members m
    where m.conversation_id = new.conversation_id
      and m.user_id is distinct from new.sender_id
    limit 1;

    if v_other is not null
       and not public.are_connected(new.sender_id, v_other)
       and not public.is_blocked_either(new.sender_id, v_other) then
      insert into public.connection_requests (requester_id, addressee_id)
      select new.sender_id, v_other
      where not exists (
        select 1
        from public.connection_requests cr
        where cr.status = 'pending'
          and least(cr.requester_id, cr.addressee_id)
            = least(new.sender_id, v_other)
          and greatest(cr.requester_id, cr.addressee_id)
            = greatest(new.sender_id, v_other)
      );
    end if;
  end if;

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
