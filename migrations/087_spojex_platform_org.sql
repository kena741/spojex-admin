-- Platform org link for live events (gifts/follow via org owner user_id).

alter table public.organizations
  add column if not exists is_platform boolean not null default false;

create unique index if not exists organizations_one_platform_idx
  on public.organizations ((true))
  where is_platform;

alter table public.live_events
  add column if not exists host_org_id uuid references public.organizations (id) on delete set null;

create index if not exists live_events_host_org_idx
  on public.live_events (host_org_id)
  where host_org_id is not null;

-- Keep host_user_id aligned with the linked org owner (gifts + follow target).
create or replace function public.live_events_sync_host_from_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.host_org_id is null then
    return new;
  end if;
  select user_id into new.host_user_id
  from public.organizations
  where id = new.host_org_id;
  return new;
end;
$$;

drop trigger if exists live_events_sync_host_from_org_biu on public.live_events;
create trigger live_events_sync_host_from_org_biu
  before insert or update of host_org_id on public.live_events
  for each row
  execute function public.live_events_sync_host_from_org();

comment on column public.organizations.is_platform is
  'Spojex platform brand org - at most one row. Follow/gifts use its owner user_id.';
comment on column public.live_events.host_org_id is
  'Organization hosting this live; syncs host_user_id to the org owner for gifts/follow.';
