-- SpoJex Admin: staff login + multiple roles.
-- Run in Supabase SQL editor (same project as spojext_superapp).
-- Safe to re-run.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

create table if not exists public.admin_role (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  permissions text[] not null default '{}',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.admin_role (slug, name, description, permissions, is_system)
values
  (
    'super_admin',
    'Super Admin',
    'Full access to every SpoJex admin module',
    array['*'],
    true
  ),
  (
    'operations_admin',
    'Operations Admin',
    'Identities, organizations, marketplace, and network operations',
    array[
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
    true
  ),
  (
    'identity_admin',
    'Identity Admin',
    'Users, organizations, and role profiles',
    array[
      'users:read', 'users:write', 'users:verify',
      'organizations:read', 'organizations:write', 'organizations:verify',
      'profiles:read', 'profiles:write'
    ],
    true
  ),
  (
    'marketplace_admin',
    'Marketplace Admin',
    'Services, categories, requests, and reviews',
    array[
      'services:read', 'services:write',
      'catalog:read', 'catalog:write',
      'requests:read', 'requests:write',
      'reviews:read'
    ],
    true
  ),
  (
    'support_admin',
    'Support Admin',
    'Reports, messages, notifications, and read access to users',
    array[
      'users:read',
      'reports:read', 'reports:write',
      'messages:read',
      'notifications:read',
      'network:read'
    ],
    true
  ),
  (
    'viewer',
    'Viewer',
    'Read-only access across modules',
    array[
      'users:read',
      'organizations:read',
      'profiles:read',
      'services:read',
      'catalog:read',
      'requests:read',
      'reviews:read',
      'network:read',
      'reports:read',
      'messages:read',
      'notifications:read'
    ],
    true
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  permissions = excluded.permissions,
  is_system = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Admins (one row per staff login)
-- ---------------------------------------------------------------------------

create table if not exists public.admin (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  role text not null references public.admin_role (slug),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_role_idx on public.admin (role);
create index if not exists admin_user_id_idx on public.admin (user_id);

drop trigger if exists admin_updated_at on public.admin;
create trigger admin_updated_at
  before update on public.admin
  for each row execute function public.set_updated_at();

drop trigger if exists admin_role_updated_at on public.admin_role;
create trigger admin_role_updated_at
  before update on public.admin_role
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers (security definer so RLS does not recurse)
-- ---------------------------------------------------------------------------

create or replace function public.admin_staff_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer from public.admin;
$$;

create or replace function public.is_spojex_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin
    where user_id = auth.uid() and is_active = true
  );
$$;

create or replace function public.current_admin_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.admin
  where user_id = auth.uid() and is_active = true
  limit 1;
$$;

create or replace function public.has_admin_permission(required text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  granted text[];
begin
  if not public.is_spojex_admin() then
    return false;
  end if;

  select r.permissions into granted
  from public.admin a
  join public.admin_role r on r.slug = a.role
  where a.user_id = auth.uid() and a.is_active = true
  limit 1;

  if granted is null then
    return false;
  end if;
  if '*' = any (granted) then
    return true;
  end if;
  return required = any (granted);
end;
$$;

grant execute on function public.admin_staff_count() to authenticated;
grant execute on function public.is_spojex_admin() to authenticated;
grant execute on function public.current_admin_role() to authenticated;
grant execute on function public.has_admin_permission(text) to authenticated;

grant select, insert, update, delete on public.admin to authenticated;
grant select, insert, update, delete on public.admin_role to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.admin enable row level security;
alter table public.admin_role enable row level security;

drop policy if exists admin_select on public.admin;
drop policy if exists admin_insert on public.admin;
drop policy if exists admin_update on public.admin;
drop policy if exists admin_delete on public.admin;
drop policy if exists admin_role_select on public.admin_role;
drop policy if exists admin_role_write on public.admin_role;

create policy admin_select on public.admin
  for select using (
    user_id = auth.uid()
    or public.is_spojex_admin()
  );

-- First signed-in staff member becomes Super Admin when the table is empty.
create policy admin_insert on public.admin
  for insert with check (
    (
      user_id = auth.uid()
      and public.admin_staff_count() = 0
    )
    or public.has_admin_permission('admins:write')
  );

create policy admin_update on public.admin
  for update
  using (public.has_admin_permission('admins:write'))
  with check (public.has_admin_permission('admins:write'));

create policy admin_delete on public.admin
  for delete using (public.has_admin_permission('admins:write'));

create policy admin_role_select on public.admin_role
  for select using (
    public.is_spojex_admin()
    or public.admin_staff_count() = 0
  );

create policy admin_role_write on public.admin_role
  for all
  using (public.has_admin_permission('roles:write'))
  with check (public.has_admin_permission('roles:write'));

notify pgrst, 'reload schema';
