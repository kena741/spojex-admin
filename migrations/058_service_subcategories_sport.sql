-- Sport-only marketplace catalog: flag categories and add admin subcategories.
-- Run after 057. Safe to re-run.

alter table public.service_categories
  add column if not exists is_sport boolean not null default true;

update public.service_categories
set is_sport = false
where lower(coalesce(slug, id::text)) in ('legal', 'travel', 'education');

create table if not exists public.service_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories (id) on delete cascade,
  slug text not null,
  label text not null,
  emoji text not null default '',
  sort_order integer not null default 0,
  is_sport boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);

create index if not exists service_subcategories_category_idx
  on public.service_subcategories (category_id, sort_order);

drop trigger if exists service_subcategories_updated_at on public.service_subcategories;
create trigger service_subcategories_updated_at
  before update on public.service_subcategories
  for each row execute function public.set_updated_at();

alter table public.services
  add column if not exists subcategory_id uuid references public.service_subcategories (id) on delete set null;

create index if not exists services_subcategory_idx on public.services (subcategory_id);

insert into public.service_subcategories (category_id, slug, label, emoji, sort_order, is_sport)
select c.id, v.slug, v.label, v.emoji, v.sort_order, true
from (
  values
    ('coaching', 'youth_coaching', 'Youth coaching', '⚽', 1),
    ('coaching', 'senior_coaching', 'Senior / first team', '⚽', 2),
    ('coaching', 'goalkeeper', 'Goalkeeper', '🧤', 3),
    ('coaching', 'tactical', 'Tactical', '📋', 4),
    ('fitness', 'strength', 'Strength & conditioning', '💪', 1),
    ('fitness', 'personal_training', 'Personal training', '🏋️', 2),
    ('fitness', 'rehab', 'Rehab & recovery', '🩹', 3),
    ('scouting', 'talent_id', 'Talent identification', '🔎', 1),
    ('scouting', 'opposition', 'Opposition analysis', '📊', 2),
    ('performance', 'match_analysis', 'Match analysis', '🧠', 1),
    ('performance', 'video_analysis', 'Video analysis', '🎬', 2),
    ('medical', 'physio', 'Physiotherapy', '🏥', 1),
    ('medical', 'sports_medicine', 'Sports medicine', '🩺', 2),
    ('medical', 'nutrition', 'Nutrition', '🥗', 3),
    ('consulting', 'club_management', 'Club management', '📊', 1),
    ('consulting', 'career_advice', 'Career advice', '🧭', 2),
    ('representation', 'player_rep', 'Player representation', '🤝', 1),
    ('representation', 'contracts', 'Contracts', '📄', 2),
    ('media', 'match_photo', 'Match photography', '📸', 1),
    ('media', 'content', 'Content / film', '🎥', 2),
    ('facilities', 'pitch_hire', 'Pitch hire', '🏟', 1),
    ('facilities', 'training_ground', 'Training ground', '🥅', 2),
    ('events', 'match_day', 'Match day', '🎟', 1),
    ('events', 'fan_events', 'Fan events', '📣', 2)
) as v(category_slug, slug, label, emoji, sort_order)
join public.service_categories c on c.slug = v.category_slug
on conflict (category_id, slug) do update set
  label = excluded.label,
  emoji = excluded.emoji,
  sort_order = excluded.sort_order,
  is_sport = true;

alter table public.service_subcategories enable row level security;

drop policy if exists subcategories_select on public.service_subcategories;
create policy subcategories_select on public.service_subcategories
  for select using (true);

drop policy if exists subcategories_write on public.service_subcategories;
create policy subcategories_write on public.service_subcategories
  for all using (public.has_admin_permission('catalog:write'))
  with check (public.has_admin_permission('catalog:write'));

grant select on table public.service_subcategories to authenticated, anon;
grant select, insert, update, delete on table public.service_subcategories to authenticated;

notify pgrst, 'reload schema';
