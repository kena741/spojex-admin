-- Firebase Cloud Messaging tokens + admin push inbox kind.
-- Latest device token lives on public.users (one token per account).

alter table public.users
  add column if not exists fcm_token text,
  add column if not exists notifications_enabled boolean not null default true;

create index if not exists users_fcm_token_idx
  on public.users (fcm_token)
  where fcm_token is not null;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (
    kind in (
      'connection_request',
      'connection_accepted',
      'message',
      'message_request',
      'group_invite',
      'group_added',
      'group_removed',
      'admin'
    )
  );

update public.admin_role
set
  permissions = array(
    select distinct unnest(permissions || array['notifications:write'])
  ),
  updated_at = now()
where slug in ('operations_admin', 'support_admin')
  and not ('notifications:write' = any (permissions));
