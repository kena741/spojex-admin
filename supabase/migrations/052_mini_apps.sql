-- Admin-managed mini apps opened in the host WebView.
-- Safe to re-run.

create table if not exists public.mini_apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  partner text not null default '',
  summary text not null default '',
  category text not null default 'Services',
  icon text not null default 'apps',
  url text not null,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mini_apps_url_https check (url ~* '^https://')
);

create index if not exists mini_apps_published_idx
  on public.mini_apps (published, sort_order, name);

drop trigger if exists mini_apps_updated_at on public.mini_apps;
create trigger mini_apps_updated_at
  before update on public.mini_apps
  for each row execute function public.set_updated_at();

update public.admin_role
set permissions = array(
  select distinct unnest(permissions || array['miniapps:read', 'miniapps:write'])
)
where slug in ('super_admin', 'operations_admin', 'marketplace_admin');

update public.admin_role
set permissions = array(
  select distinct unnest(permissions || array['miniapps:read'])
)
where slug = 'viewer';

alter table public.mini_apps enable row level security;

drop policy if exists mini_apps_public_select on public.mini_apps;
drop policy if exists mini_apps_admin_write on public.mini_apps;

create policy mini_apps_public_select on public.mini_apps
  for select using (
    published = true
    or public.has_admin_permission('miniapps:read')
  );

create policy mini_apps_admin_write on public.mini_apps
  for all using (public.has_admin_permission('miniapps:write'))
  with check (public.has_admin_permission('miniapps:write'));

grant select on public.mini_apps to anon, authenticated;
grant insert, update, delete on public.mini_apps to authenticated;

insert into public.mini_apps (
  id, slug, name, partner, summary, category, icon, url, published, sort_order
)
values (
  'a1000000-0000-4000-8000-000000000001',
  'zemen-service',
  'Zemen Service',
  'Zemen Service',
  'Trusted local services, booked in minutes.',
  'Services',
  'handshake',
  'https://www.zemenservice.com/',
  true,
  0
)
on conflict (slug) do update set
  name = excluded.name,
  partner = excluded.partner,
  summary = excluded.summary,
  category = excluded.category,
  icon = excluded.icon,
  url = excluded.url,
  published = excluded.published,
  sort_order = excluded.sort_order,
  updated_at = now();
