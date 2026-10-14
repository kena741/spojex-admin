-- Chat mute + presence: notify only unmuted members with notifications on
-- who are not currently viewing that conversation.

alter table public.users
  add column if not exists active_conversation_id uuid;

create index if not exists users_active_conversation_idx
  on public.users (active_conversation_id)
  where active_conversation_id is not null;

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
  v_title text;
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
  v_title := case
    when v_kind = 'message_request' then 'Message request'
    else v_sender_name
  end;

  for v_member in
    select cm.user_id
    from public.conversation_members cm
    join public.users u on u.id = cm.user_id
    where cm.conversation_id = new.conversation_id
      and cm.user_id is distinct from new.sender_id
      and cm.hidden = false
      and coalesce(cm.muted, false) = false
      and coalesce(u.notifications_enabled, true) = true
      and (
        u.active_conversation_id is null
        or u.active_conversation_id is distinct from new.conversation_id
      )
  loop
    perform public._notify_user(
      v_member.user_id,
      v_kind,
      v_title,
      case
        when v_kind = 'message_request' then
          v_sender_name || ': ' || coalesce(v_preview, '')
        else coalesce(v_preview, '')
      end,
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'message_id', new.id,
        'from_user_id', new.sender_id,
        'route', '/chat/' || new.conversation_id::text
      )
    );
  end loop;

  return new;
end;
$$;
