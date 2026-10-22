-- Radio Chat moderation hardening: report workflow, station restrictions, chat pause/slow mode.
-- Mirror of Alembic a1spojex000066. Safe to re-run.

alter table public.radio_chat_reports
  add column if not exists status text not null default 'open';

alter table public.radio_chat_reports
  add column if not exists reviewed_at timestamptz;

alter table public.radio_chat_reports
  add column if not exists reviewed_by_admin_id uuid;

alter table public.radio_chat_reports
  add column if not exists resolution_note text not null default '';

alter table public.radio_chat_reports
  add column if not exists assigned_admin_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'radio_chat_reports_status_check'
  ) then
    alter table public.radio_chat_reports
      add constraint radio_chat_reports_status_check
      check (status in ('open', 'in_review', 'resolved', 'dismissed'));
  end if;
end $$;

update public.radio_chat_reports
set status = 'open'
where nullif(trim(status), '') is null;

create index if not exists radio_chat_reports_status_idx
  on public.radio_chat_reports (status, created_at desc);

create index if not exists radio_chat_reports_message_status_idx
  on public.radio_chat_reports (message_id, status)
  where message_id is not null;

-- Station-scoped moderator restrictions (distinct from peer mutes).
create table if not exists public.radio_chat_restrictions (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.radio_streams (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('mute', 'ban')),
  reason text not null default '',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by_admin_id uuid,
  lifted_at timestamptz,
  lifted_by_admin_id uuid,
  lift_reason text not null default ''
);

create index if not exists radio_chat_restrictions_active_idx
  on public.radio_chat_restrictions (stream_id, user_id)
  where lifted_at is null;

create index if not exists radio_chat_restrictions_user_idx
  on public.radio_chat_restrictions (user_id, created_at desc);

-- Station chat controls
alter table public.radio_streams
  add column if not exists chat_paused_at timestamptz;

alter table public.radio_streams
  add column if not exists chat_slow_mode_seconds integer not null default 0;

comment on column public.radio_streams.chat_paused_at is
  'When set, listeners cannot send chat. Playback is unaffected.';
comment on column public.radio_streams.chat_slow_mode_seconds is
  'Minimum seconds between messages per user when > 0.';

-- Enforce restrictions + pause + slow mode on send
create or replace function public.send_radio_chat_message(
  p_stream_id uuid,
  p_message text,
  p_client_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_body text := trim(coalesce(p_message, ''));
  v_id uuid;
  v_payload jsonb;
  v_existing uuid;
  v_paused timestamptz;
  v_slow int := 0;
  v_restriction_kind text;
begin
  if v_me is null then
    raise exception 'Sign in to chat.';
  end if;
  if p_stream_id is null then
    raise exception 'Station not found.';
  end if;
  if public.radio_chat_lifecycle(p_stream_id) <> 'live' then
    raise exception 'This radio session has ended.';
  end if;

  select s.chat_paused_at, coalesce(s.chat_slow_mode_seconds, 0)
  into v_paused, v_slow
  from public.radio_streams s
  where s.id = p_stream_id;

  if v_paused is not null then
    raise exception 'Chat is paused for this station.';
  end if;

  select r.kind
  into v_restriction_kind
  from public.radio_chat_restrictions r
  where r.stream_id = p_stream_id
    and r.user_id = v_me
    and r.lifted_at is null
    and (r.expires_at is null or r.expires_at > now())
  order by case when r.kind = 'ban' then 0 else 1 end
  limit 1;

  if found then
    if v_restriction_kind = 'ban' then
      raise exception 'You are banned from this station chat.';
    end if;
    raise exception 'You are muted in this station chat.';
  end if;

  if v_body = '' then
    raise exception 'Write a message first.';
  end if;
  if char_length(v_body) > 300 then
    raise exception 'Keep messages under 300 characters.';
  end if;

  if v_slow > 0 and exists (
    select 1
    from public.radio_chat_messages m
    where m.user_id = v_me
      and m.stream_id = p_stream_id
      and m.created_at > now() - make_interval(secs => v_slow)
  ) then
    raise exception 'Slow mode is on. Wait a moment before sending again.';
  end if;

  if (
    select count(*)
    from public.radio_chat_messages m
    where m.user_id = v_me
      and m.stream_id = p_stream_id
      and m.created_at > now() - interval '10 seconds'
  ) >= 5 then
    raise exception 'You are sending too fast. Wait a moment.';
  end if;

  if exists (
    select 1
    from public.radio_chat_messages m
    where m.user_id = v_me
      and m.stream_id = p_stream_id
      and m.message = v_body
      and m.created_at > now() - interval '15 seconds'
  ) then
    raise exception 'That message was just sent.';
  end if;

  if p_client_id is not null then
    select m.id into v_existing
    from public.radio_chat_messages m
    where m.stream_id = p_stream_id
      and m.client_id = p_client_id
    limit 1;
    if v_existing is not null then
      return public._radio_chat_payload(v_existing);
    end if;
  end if;

  insert into public.radio_chat_messages (
    stream_id, user_id, message, client_id
  )
  values (p_stream_id, v_me, v_body, p_client_id)
  returning id into v_id;

  v_payload := public._radio_chat_payload(v_id);
  perform public._radio_chat_broadcast('message', p_stream_id, v_payload);
  return v_payload;
exception
  when unique_violation then
    select m.id into v_id
    from public.radio_chat_messages m
    where m.stream_id = p_stream_id
      and m.client_id = p_client_id
    limit 1;
    if v_id is null then
      raise;
    end if;
    return public._radio_chat_payload(v_id);
end;
$$;

-- Bootstrap: surface pause / restriction to clients
create or replace function public.radio_chat_bootstrap(
  p_stream_id uuid,
  p_limit int default 150
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_life text := public.radio_chat_lifecycle(p_stream_id);
  v_limit int := least(greatest(coalesce(p_limit, 150), 1), 200);
  v_messages jsonb := '[]'::jsonb;
  v_mutes jsonb := '[]'::jsonb;
  v_paused timestamptz;
  v_slow int := 0;
  v_can_send boolean := false;
  v_block_reason text := null;
  v_has_restriction boolean := false;
  v_restriction_kind text := null;
  v_restriction_expires timestamptz := null;
  v_restriction_reason text := null;
begin
  if p_stream_id is null then
    raise exception 'Station not found.';
  end if;

  select s.chat_paused_at, coalesce(s.chat_slow_mode_seconds, 0)
  into v_paused, v_slow
  from public.radio_streams s
  where s.id = p_stream_id;

  if v_life = 'offline' and not public.can_moderate_radio_chat() then
    return jsonb_build_object(
      'lifecycle', v_life,
      'can_send', false,
      'chat_paused', v_paused is not null,
      'slow_mode_seconds', v_slow,
      'block_reason', 'Station chat is offline.',
      'restriction_kind', null,
      'restriction_expires_at', null,
      'me_id', v_me,
      'is_moderator', public.can_moderate_radio_chat(),
      'messages', '[]'::jsonb,
      'muted_user_ids', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(row_payload order by created_at), '[]'::jsonb)
  into v_messages
  from (
    select
      m.created_at,
      jsonb_build_object(
        'id', m.id,
        'client_id', m.client_id,
        'stream_id', m.stream_id,
        'user_id', m.user_id,
        'message', m.message,
        'created_at', m.created_at,
        'status', m.status,
        'display_name', coalesce(nullif(u.display_name, ''), 'Listener'),
        'avatar_url', coalesce(u.avatar_url, '')
      ) as row_payload
    from public.radio_chat_messages m
    join public.users u on u.id = m.user_id
    where m.stream_id = p_stream_id
      and m.status = 'active'
      and (
        v_me is null
        or not public.is_blocked_either(v_me, m.user_id)
      )
      and (
        v_me is null
        or not exists (
          select 1
          from public.radio_chat_mutes mu
          where mu.stream_id = p_stream_id
            and mu.muted_by = v_me
            and mu.muted_user_id = m.user_id
        )
      )
    order by m.created_at desc
    limit v_limit
  ) recent;

  if v_me is not null then
    select coalesce(jsonb_agg(to_jsonb(mu.muted_user_id)), '[]'::jsonb)
    into v_mutes
    from public.radio_chat_mutes mu
    where mu.stream_id = p_stream_id
      and mu.muted_by = v_me;

    select r.kind, r.expires_at, r.reason
    into v_restriction_kind, v_restriction_expires, v_restriction_reason
    from public.radio_chat_restrictions r
    where r.stream_id = p_stream_id
      and r.user_id = v_me
      and r.lifted_at is null
      and (r.expires_at is null or r.expires_at > now())
    order by case when r.kind = 'ban' then 0 else 1 end
    limit 1;
    v_has_restriction := found;
  end if;

  v_can_send := v_life = 'live' and v_me is not null and v_paused is null and not v_has_restriction;
  if v_life <> 'live' then
    v_block_reason := 'This radio session has ended.';
  elsif v_paused is not null then
    v_block_reason := 'Chat is paused for this station.';
  elsif v_has_restriction and v_restriction_kind = 'ban' then
    v_block_reason := coalesce(nullif(v_restriction_reason, ''), 'You are banned from this station chat.');
  elsif v_has_restriction then
    v_block_reason := coalesce(nullif(v_restriction_reason, ''), 'You are muted in this station chat.');
  end if;

  return jsonb_build_object(
    'lifecycle', v_life,
    'can_send', v_can_send,
    'chat_paused', v_paused is not null,
    'slow_mode_seconds', v_slow,
    'block_reason', v_block_reason,
    'restriction_kind', v_restriction_kind,
    'restriction_expires_at', v_restriction_expires,
    'me_id', v_me,
    'is_moderator', public.can_moderate_radio_chat(),
    'messages', v_messages,
    'muted_user_ids', coalesce(v_mutes, '[]'::jsonb)
  );
end;
$$;

-- Moderator restore (broadcasts message again so clients re-attach)
create or replace function public.restore_radio_chat_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_row public.radio_chat_messages%rowtype;
  v_payload jsonb;
begin
  if v_me is null then
    raise exception 'Sign in to moderate chat.';
  end if;
  if not public.can_moderate_radio_chat() then
    raise exception 'Moderator access required.';
  end if;

  select * into v_row
  from public.radio_chat_messages
  where id = p_message_id;

  if not found then
    raise exception 'Message not found.';
  end if;

  update public.radio_chat_messages
  set status = 'active',
      deleted_at = null
  where id = p_message_id
    and status <> 'active';

  v_payload := public._radio_chat_payload(p_message_id);
  perform public._radio_chat_broadcast('message', v_row.stream_id, v_payload);
  return v_payload;
end;
$$;

create table if not exists public.radio_chat_moderation_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  stream_id uuid references public.radio_streams (id) on delete set null,
  message_id uuid references public.radio_chat_messages (id) on delete set null,
  report_id uuid references public.radio_chat_reports (id) on delete set null,
  target_user_id uuid references public.users (id) on delete set null,
  actor_admin_id uuid,
  action text not null,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists radio_chat_moderation_events_message_idx
  on public.radio_chat_moderation_events (message_id, created_at desc);

create index if not exists radio_chat_moderation_events_stream_idx
  on public.radio_chat_moderation_events (stream_id, created_at desc);
