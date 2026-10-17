-- Persist when the user last viewed "New followers" so the unread badge
-- resets to 0 after open (and stays reset across devices / reloads).
-- Safe to re-run.

alter table public.users
  add column if not exists followers_seen_at timestamptz;

comment on column public.users.followers_seen_at is
  'When the user last opened the New followers activity tab. Follows with created_at after this count as unread.';

create or replace function public.mark_followers_seen(
  p_seen_at timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_football_user_id();
  stamp timestamptz;
  latest timestamptz;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select max(f.created_at)
    into latest
  from public.follows f
  where f.following_id = me;

  -- Cover every currently-known follower (plus now) so the badge clears even
  -- when device clocks and server timestamps disagree slightly.
  stamp := greatest(
    coalesce(p_seen_at, now()),
    coalesce(latest, now()),
    now()
  ) + interval '1 millisecond';

  update public.users
  set followers_seen_at = stamp
  where id = me;

  return stamp;
end;
$$;

create or replace function public.new_followers_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := public.current_football_user_id();
  seen timestamptz;
begin
  if me is null then
    return 0;
  end if;

  select u.followers_seen_at
    into seen
  from public.users u
  where u.id = me;

  if seen is null then
    -- Never opened New followers: treat all current followers as unread.
    return (
      select count(*)::int
      from public.follows f
      where f.following_id = me
    );
  end if;

  return (
    select count(*)::int
    from public.follows f
    where f.following_id = me
      and f.created_at > seen
  );
end;
$$;

create or replace function public.followers_seen_at()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select u.followers_seen_at
  from public.users u
  where u.id = public.current_football_user_id();
$$;

revoke all on function public.mark_followers_seen(timestamptz) from public;
revoke all on function public.new_followers_count() from public;
revoke all on function public.followers_seen_at() from public;

grant execute on function public.mark_followers_seen(timestamptz) to authenticated;
grant execute on function public.new_followers_count() to authenticated;
grant execute on function public.followers_seen_at() to authenticated;
