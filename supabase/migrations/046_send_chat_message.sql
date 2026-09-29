-- Send chat messages through a security-definer RPC.
-- Client inserts were failing RLS: the WITH CHECK subquery on conversations /
-- messages ran under RLS and rejected valid first messages.
-- One-shot request rules stay in tg_messages_limit_request.

create or replace function public.send_chat_message(
  p_conversation_id uuid,
  p_body text,
  p_reply_to_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_id uuid;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_me is null then
    raise exception 'Sign in to send a message.';
  end if;
  if p_conversation_id is null then
    raise exception 'Conversation not found.';
  end if;
  if v_body = '' then
    raise exception 'Write a message first.';
  end if;
  if not exists (
    select 1
    from public.conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = v_me
  ) then
    raise exception 'You cannot send messages in this chat.';
  end if;
  if exists (
    select 1
    from public.conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id <> v_me
      and public.is_blocked_either(v_me, m.user_id)
  ) then
    raise exception 'You cannot message this user.';
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    type,
    body,
    reply_to_id
  )
  values (
    p_conversation_id,
    v_me,
    'text',
    v_body,
    p_reply_to_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.send_chat_message(uuid, text, uuid) to authenticated;

-- Keep a simple insert policy for any remaining client writes.
-- Request one-shot is enforced by the BEFORE trigger, not this policy.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    public.is_current_football_user(sender_id)
    and public.is_conversation_member(conversation_id)
  );

grant select, insert, update on table public.messages to authenticated;
grant select, update on table public.conversations to authenticated;
grant select, update on table public.conversation_members to authenticated;

notify pgrst, 'reload schema';
