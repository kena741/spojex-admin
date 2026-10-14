-- Grant connection management to ops and support admins.

update public.admin_role
set
  permissions = array(
    select distinct unnest(permissions || array['network:write'])
  ),
  updated_at = now()
where slug in ('operations_admin', 'support_admin')
  and not ('network:write' = any (permissions));
