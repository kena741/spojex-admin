-- Live chat for radio streams.
-- Persist a short history; deliver new lines over Realtime Broadcast.
-- Channel topic: radio:{stream_id}
-- Run in the live SQL editor after 059. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Stream lifecycle: live / ended / offline
-- active = live. inactive + ended_at within 24h = ended. otherwise offline.
-- ---------------------------------------------------------------------------

alter table public.radio_streams
  add column if not exists ended_at timestamptz;

update public.radio_streams
set ended_at = coalesce(ended_at, updated_at, now())
where status = 'inactive'
  and ended_at is null;

create or replace function public.radio_streams_set_ended_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'inactive' and new.ended_at is null then
      new.ended_at = now();
    elsif new.status = 'active' then
      new.ended_at = null;
    end if;
    return new;
  end if;

  if new.status = 'inactive' and old.status = 'active' then
    new.ended_at = now();
  elsif new.status = 'active' then
    new.ended_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists radio_streams_set_ended_at on public.radio_streams;
create trigger radio_streams_set_ended_at
  before insert or update of status on public.radio_streams
  for each row execute function public.radio_streams_set_ended_at();

create or replace function public.radio_chat_lifecycle(p_stream_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.id is null then 'offline'
    when s.status = 'active' then 'live'
    when s.ended_at is not null
      and s.ended_at > now() - interval '24 hours' then 'ended'
    else 'offline'
  end
  from (select p_stream_id as id) q
  left join public.radio_streams s on s.id = q.id;
$$;

create or replace function public.radio_chat_stream_visible(p_stream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.radio_chat_lifecycle(p_stream_id) in ('live', 'ended');
$$;

create or replace function public.can_moderate_radio_chat()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_admin_permission('streams:write')
      or public.has_admin_permission('reports:write')
      or public.has_admin_permission('messages:read')
      or public.has_admin_permission('messages:write');
$$;

grant execute on function public.radio_chat_lifecycle(uuid) to anon, authenticated;
grant execute on function public.radio_chat_stream_visible(uuid) to anon, authenticated;
grant execute on function public.can_moderate_radio_chat() to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.radio_chat_messages (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.radio_streams (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  status text not null default 'active'
    check (status in ('active', 'hidden', 'deleted')),
  deleted_at timestamptz,
  client_id uuid
);

create index if not exists radio_chat_messages_stream_idx
  on public.radio_chat_messages (stream_id);

create index if not exists radio_chat_messages_created_idx
  on public.radio_chat_messages (created_at);

create index if not exists radio_chat_messages_user_idx
  on public.radio_chat_messages (user_id);

create index if not exists radio_chat_messages_stream_active_idx
  on public.radio_chat_messages (stream_id, created_at desc)
  where status = 'active';

create unique index if not exists radio_chat_messages_client_id_idx
  on public.radio_chat_messages (stream_id, client_id)
  where client_id is not null;

create table if not exists public.radio_chat_mutes (
  stream_id uuid not null references public.radio_streams (id) on delete cascade,
  muted_user_id uuid not null references public.users (id) on delete cascade,
  muted_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (stream_id, muted_user_id, muted_by),
  check (muted_user_id <> muted_by)
);

create index if not exists radio_chat_mutes_by_idx
  on public.radio_chat_mutes (muted_by, stream_id);

create table if not exists public.radio_chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users (id) on delete cascade,
  message_id uuid references public.radio_chat_messages (id) on delete set null,
  target_user_id uuid references public.users (id) on delete set null,
  stream_id uuid not null references public.radio_streams (id) on delete cascade,
  reason text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists radio_chat_reports_once_idx
  on public.radio_chat_reports (reporter_id, message_id);

create index if not exists radio_chat_reports_stream_idx
  on public.radio_chat_reports (stream_id, created_at desc);

-- Do not publish this table to supabase_realtime. Delivery is Broadcast.

alter table public.radio_chat_messages enable row level security;
alter table public.radio_chat_mutes enable row level security;
alter table public.radio_chat_reports enable row level security;

drop policy if exists radio_chat_messages_select on public.radio_chat_messages;
create policy radio_chat_messages_select on public.radio_chat_messages
  for select using (
    (
      status = 'active'
      and public.radio_chat_stream_visible(stream_id)
    )
    or public.is_current_football_user(user_id)
    or public.can_moderate_radio_chat()
  );

drop policy if exists radio_chat_mutes_select on public.radio_chat_mutes;
create policy radio_chat_mutes_select on public.radio_chat_mutes
  for select using (public.is_current_football_user(muted_by));

drop policy if exists radio_chat_mutes_insert on public.radio_chat_mutes;
create policy radio_chat_mutes_insert on public.radio_chat_mutes
  for insert with check (public.is_current_football_user(muted_by));

drop policy if exists radio_chat_mutes_delete on public.radio_chat_mutes;
create policy radio_chat_mutes_delete on public.radio_chat_mutes
  for delete using (public.is_current_football_user(muted_by));

drop policy if exists radio_chat_reports_select on public.radio_chat_reports;
create policy radio_chat_reports_select on public.radio_chat_reports
  for select using (
    public.is_current_football_user(reporter_id)
    or public.can_moderate_radio_chat()
  );

drop policy if exists radio_chat_reports_insert on public.radio_chat_reports;
create policy radio_chat_reports_insert on public.radio_chat_reports
  for insert with check (public.is_current_football_user(reporter_id));

grant select on table public.radio_chat_messages to anon, authenticated;
grant select, insert, delete on table public.radio_chat_mutes to authenticated;
grant select, insert on table public.radio_chat_reports to authenticated;

-- Writes go through security-definer RPCs. No client insert/update/delete
-- on radio_chat_messages, so user_id cannot be impersonated.

-- ---------------------------------------------------------------------------
-- Broadcast helper (private channel radio:{stream_id})
-- ---------------------------------------------------------------------------

create or replace function public._radio_chat_broadcast(
  p_event text,
  p_stream_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.send(
    p_payload,
    p_event,
    'radio:' || p_stream_id::text,
    true
  );
exception
  when undefined_function then
    null;
  when others then
    raise notice 'radio chat broadcast skipped: %', sqlerrm;
end;
$$;

create or replace function public._radio_chat_payload(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', m.id,
    'client_id', m.client_id,
    'stream_id', m.stream_id,
    'user_id', m.user_id,
    'message', m.message,
    'created_at', m.created_at,
    'status', m.status,
    'display_name', coalesce(nullif(u.display_name, ''), 'Listener'),
    'avatar_url', coalesce(u.avatar_url, '')
  )
  from public.radio_chat_messages m
  join public.users u on u.id = m.user_id
  where m.id = p_id;
$$;

-- Authenticated users may receive private radio broadcasts.
-- Clients are not granted INSERT, so they cannot spoof sends.
do $rt$
begin
  if to_regclass('realtime.messages') is null then
    return;
  end if;
  execute 'alter table realtime.messages enable row level security';
  execute 'drop policy if exists radio_chat_broadcast_receive on realtime.messages';
  execute $p$
    create policy radio_chat_broadcast_receive
    on realtime.messages
    for select
    to authenticated
    using (true)
  $p$;
exception
  when duplicate_object then
    null;
  when others then
    raise notice 'realtime.messages policy skipped: %', sqlerrm;
end;
$rt$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

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
begin
  if p_stream_id is null then
    raise exception 'Station not found.';
  end if;
  if v_life = 'offline' and not public.can_moderate_radio_chat() then
    return jsonb_build_object(
      'lifecycle', v_life,
      'can_send', false,
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
    select coalesce(
      jsonb_agg(to_jsonb(mu.muted_user_id)),
      '[]'::jsonb
    )
    into v_mutes
    from public.radio_chat_mutes mu
    where mu.stream_id = p_stream_id
      and mu.muted_by = v_me;
  end if;

  return jsonb_build_object(
    'lifecycle', v_life,
    'can_send', v_life = 'live' and v_me is not null,
    'me_id', v_me,
    'is_moderator', public.can_moderate_radio_chat(),
    'messages', v_messages,
    'muted_user_ids', coalesce(v_mutes, '[]'::jsonb)
  );
end;
$$;

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
  if v_body = '' then
    raise exception 'Write a message first.';
  end if;
  if char_length(v_body) > 300 then
    raise exception 'Keep messages under 300 characters.';
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
    stream_id,
    user_id,
    message,
    client_id
  )
  values (
    p_stream_id,
    v_me,
    v_body,
    p_client_id
  )
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

create or replace function public.hide_radio_chat_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_row public.radio_chat_messages%rowtype;
begin
  if v_me is null then
    raise exception 'Sign in to moderate chat.';
  end if;

  select * into v_row
  from public.radio_chat_messages
  where id = p_message_id;

  if not found then
    raise exception 'Message not found.';
  end if;

  if v_row.user_id <> v_me and not public.can_moderate_radio_chat() then
    raise exception 'You can only delete your own messages.';
  end if;

  update public.radio_chat_messages
  set status = 'hidden',
      deleted_at = now()
  where id = p_message_id
    and status = 'active';

  perform public._radio_chat_broadcast(
    'delete',
    v_row.stream_id,
    jsonb_build_object('id', p_message_id)
  );

  return jsonb_build_object('ok', true, 'id', p_message_id);
end;
$$;

create or replace function public.report_radio_chat_message(
  p_message_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_reason text := trim(coalesce(p_reason, ''));
  v_row public.radio_chat_messages%rowtype;
begin
  if v_me is null then
    raise exception 'Sign in to report.';
  end if;
  if v_reason = '' then
    v_reason := 'inappropriate';
  end if;

  select * into v_row
  from public.radio_chat_messages
  where id = p_message_id;

  if not found then
    raise exception 'Message not found.';
  end if;
  if v_row.user_id = v_me then
    raise exception 'You cannot report your own message.';
  end if;

  insert into public.radio_chat_reports (
    reporter_id,
    message_id,
    target_user_id,
    stream_id,
    reason
  )
  values (
    v_me,
    p_message_id,
    v_row.user_id,
    v_row.stream_id,
    left(v_reason, 200)
  )
  on conflict (reporter_id, message_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mute_radio_chat_user(
  p_stream_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_football_user_id();
begin
  if v_me is null then
    raise exception 'Sign in to mute someone.';
  end if;
  if p_user_id is null or p_user_id = v_me then
    raise exception 'You cannot mute yourself.';
  end if;
  if p_stream_id is null then
    raise exception 'Station not found.';
  end if;

  insert into public.radio_chat_mutes (stream_id, muted_user_id, muted_by)
  values (p_stream_id, p_user_id, v_me)
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.cleanup_radio_chat_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  delete from public.radio_chat_messages m
  using public.radio_streams s
  where m.stream_id = s.id
    and s.status = 'inactive'
    and s.ended_at is not null
    and s.ended_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.radio_chat_bootstrap(uuid, int) from public;
revoke all on function public.send_radio_chat_message(uuid, text, uuid) from public;
revoke all on function public.hide_radio_chat_message(uuid) from public;
revoke all on function public.report_radio_chat_message(uuid, text) from public;
revoke all on function public.mute_radio_chat_user(uuid, uuid) from public;
revoke all on function public.cleanup_radio_chat_messages() from public;

grant execute on function public.radio_chat_bootstrap(uuid, int) to authenticated;
grant execute on function public.send_radio_chat_message(uuid, text, uuid) to authenticated;
grant execute on function public.hide_radio_chat_message(uuid) to authenticated;
grant execute on function public.report_radio_chat_message(uuid, text) to authenticated;
grant execute on function public.mute_radio_chat_user(uuid, uuid) to authenticated;
grant execute on function public.cleanup_radio_chat_messages() to service_role;

-- Broadcast stream lifecycle so open radios disable chat without a refresh.
create or replace function public.radio_streams_broadcast_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (old.status is distinct from new.status) then
    perform public._radio_chat_broadcast(
      'stream',
      new.id,
      jsonb_build_object(
        'lifecycle', public.radio_chat_lifecycle(new.id),
        'stream_id', new.id
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists radio_streams_broadcast_lifecycle on public.radio_streams;
create trigger radio_streams_broadcast_lifecycle
  after update of status on public.radio_streams
  for each row execute function public.radio_streams_broadcast_lifecycle();

-- Hourly cleanup if pg_cron is enabled on this project.
do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
      execute 'create extension if not exists pg_cron';
    else
      raise notice 'pg_cron is not available; run cleanup_radio_chat_messages() from SQL or a scheduled job.';
      return;
    end if;
  end if;

  begin
    perform cron.unschedule('cleanup-radio-chat');
  exception
    when others then
      null;
  end;

  perform cron.schedule(
    'cleanup-radio-chat',
    '20 * * * *',
    $job$select public.cleanup_radio_chat_messages()$job$
  );
exception
  when others then
    raise notice 'radio chat cleanup cron not scheduled: %', sqlerrm;
end;
$cron$;
