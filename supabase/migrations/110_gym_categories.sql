-- Gym categories catalog (admin-managed), used by gym home filters and create forms.
-- Replaces the hard-coded gyms.category check constraint so admins can add types.

create table if not exists public.gym_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  emoji text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gym_categories_sort_idx
  on public.gym_categories (sort_order);

drop trigger if exists gym_categories_updated_at on public.gym_categories;
create trigger gym_categories_updated_at
  before update on public.gym_categories
  for each row execute function public.set_updated_at();

insert into public.gym_categories (slug, label, emoji, sort_order)
values
  ('gym', 'Gym', '🏋️', 1),
  ('fitness_center', 'Fitness center', '💪', 2),
  ('football_academy', 'Football academy', '⚽', 3),
  ('sports_club', 'Sports club', '🏅', 4),
  ('swimming_pool', 'Swimming pool', '🏊', 5),
  ('martial_arts', 'Martial arts', '🥋', 6),
  ('other', 'Other', '•', 7)
on conflict (slug) do update
set
  label = excluded.label,
  emoji = case
    when coalesce(trim(public.gym_categories.emoji), '') = '' then excluded.emoji
    else public.gym_categories.emoji
  end,
  sort_order = excluded.sort_order;

-- Allow any slug that exists in gym_categories (or legacy empty).
alter table public.gyms drop constraint if exists gyms_category_check;

grant select on table public.gym_categories to authenticated, anon;
grant select, insert, update, delete on table public.gym_categories to authenticated;

alter table public.gym_categories enable row level security;

drop policy if exists gym_categories_select on public.gym_categories;
create policy gym_categories_select on public.gym_categories
  for select using (true);

drop policy if exists gym_categories_write on public.gym_categories;
create policy gym_categories_write on public.gym_categories
  for all using (
    public.has_admin_permission('gyms:write')
    or public.has_admin_permission('catalog:write')
  ) with check (
    public.has_admin_permission('gyms:write')
    or public.has_admin_permission('catalog:write')
  );

notify pgrst, 'reload schema';
