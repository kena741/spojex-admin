-- Admin write access for signup role catalog + grant profiles:write to identity admins.
-- Run after 023_identity_role_catalog.sql.

-- ---------------------------------------------------------------------------
-- RLS: admins can manage identity role catalog (when not using service role)
-- ---------------------------------------------------------------------------

drop policy if exists identity_role_groups_admin_write on public.identity_role_groups;
create policy identity_role_groups_admin_write on public.identity_role_groups
  for all
  using (public.is_spojex_admin())
  with check (public.is_spojex_admin());

drop policy if exists identity_roles_admin_write on public.identity_roles;
create policy identity_roles_admin_write on public.identity_roles
  for all
  using (public.is_spojex_admin())
  with check (public.is_spojex_admin());

-- ---------------------------------------------------------------------------
-- Permissions: identity + operations admins can edit/delete account roles
-- ---------------------------------------------------------------------------

update public.admin_role
set
  permissions = array[
    'users:read', 'users:write', 'users:verify',
    'organizations:read', 'organizations:write', 'organizations:verify',
    'profiles:read', 'profiles:write',
    'services:read', 'services:write',
    'catalog:read', 'catalog:write',
    'requests:read', 'requests:write',
    'reviews:read',
    'network:read',
    'reports:read', 'reports:write',
    'messages:read',
    'notifications:read'
  ],
  updated_at = now()
where slug = 'operations_admin';

update public.admin_role
set
  permissions = array[
    'users:read', 'users:write', 'users:verify',
    'organizations:read', 'organizations:write', 'organizations:verify',
    'profiles:read', 'profiles:write'
  ],
  updated_at = now()
where slug = 'identity_admin';

notify pgrst, 'reload schema';
