-- Signup identity catalog: role groups + roles shown during account creation.
-- Matches mobile IdentityCatalog / RoleCategoryPicker. UUID ids from gen_random_uuid().
-- users.role continues to store identity_roles.slug (fan, player, coach, …).
-- Run after 022_service_categories_uuid.sql. Safe to re-run.

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
-- Role groups (Community, Athlete, Professional, Media)
-- ---------------------------------------------------------------------------

create table if not exists public.identity_role_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Signup roles (fan, player, coach, …)
-- ---------------------------------------------------------------------------

create table if not exists public.identity_roles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.identity_role_groups (id) on delete cascade,
  slug text not null unique,
  label text not null,
  blurb text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists identity_roles_group_idx on public.identity_roles (group_id);
create index if not exists identity_roles_sort_idx on public.identity_roles (group_id, sort_order);

-- ---------------------------------------------------------------------------
-- Seed groups + roles (mobile signup catalog)
-- ---------------------------------------------------------------------------

insert into public.identity_role_groups (slug, label, sort_order)
values
  ('community', 'Community', 1),
  ('athlete', 'Athlete', 2),
  ('professional', 'Professional', 3),
  ('media', 'Media', 4)
on conflict (slug) do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.identity_roles (group_id, slug, label, blurb, sort_order, is_system)
select g.id, v.slug, v.label, v.blurb, v.sort_order, true
from (
  values
    ('community', 'fan', 'Fan', 'Follow clubs, events, and communities.', 1),
    ('community', 'parent_guardian', 'Parent / Guardian', 'Safeguarded access for a young player.', 2),
    ('athlete', 'player', 'Player', 'Build identity, get discovered, apply to trials.', 1),
    ('professional', 'coach', 'Coach', 'Reputation, roles, and staff opportunities.', 1),
    ('professional', 'scout', 'Scout', 'Find talent and follow verified pipelines.', 2),
    ('professional', 'agent', 'Agent', 'Represent players and manage professional pathways.', 3),
    ('professional', 'referee', 'Referee', 'Match officials and officiating development.', 4),
    ('professional', 'analyst', 'Analyst', 'Match analysis and performance insight.', 5),
    ('professional', 'fitness_coach', 'Fitness / Performance', 'Strength, conditioning, and athletic development.', 6),
    ('professional', 'physiotherapist', 'Physiotherapist', 'Injury prevention and return-to-play support.', 7),
    ('professional', 'nutritionist', 'Nutritionist', 'Football nutrition and recovery planning.', 8),
    ('professional', 'consultant', 'Consultant', 'Advisory work across clubs and programmes.', 9),
    ('professional', 'administrator', 'Administrator', 'Club operations, compliance, and administration.', 10),
    ('professional', 'medical', 'Medical', 'Sports medicine and clinical support.', 11),
    ('professional', 'other_professional', 'Other Football Professional', 'A football role that is not in the list above.', 12),
    ('media', 'photographer', 'Photographer / Videographer', 'Match-day media and highlight production.', 1),
    ('media', 'sports_journalist', 'Journalist / Media', 'Reporting, content, and football storytelling.', 2)
) as v(group_slug, slug, label, blurb, sort_order)
join public.identity_role_groups g on g.slug = v.group_slug
on conflict (slug) do update set
  group_id = excluded.group_id,
  label = excluded.label,
  blurb = excluded.blurb,
  sort_order = excluded.sort_order,
  updated_at = now();

drop trigger if exists identity_role_groups_updated_at on public.identity_role_groups;
create trigger identity_role_groups_updated_at
  before update on public.identity_role_groups
  for each row execute function public.set_updated_at();

drop trigger if exists identity_roles_updated_at on public.identity_roles;
create trigger identity_roles_updated_at
  before update on public.identity_roles
  for each row execute function public.set_updated_at();

alter table public.identity_role_groups enable row level security;
alter table public.identity_roles enable row level security;

drop policy if exists identity_role_groups_select on public.identity_role_groups;
create policy identity_role_groups_select on public.identity_role_groups
  for select using (true);

drop policy if exists identity_roles_select on public.identity_roles;
create policy identity_roles_select on public.identity_roles
  for select using (true);

notify pgrst, 'reload schema';
