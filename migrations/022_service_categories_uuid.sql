-- service_categories: text slug PK → uuid PK + slug column.
-- Seeds match mobile create_service_screen.dart (12 marketplace categories).
-- Run after 016_admins.sql. Safe to re-run.

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
-- Staging table (uuid PK)
-- ---------------------------------------------------------------------------

create table if not exists public.service_categories_next (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  emoji text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.service_categories_next (slug, label, emoji, sort_order)
values
  ('coaching', 'Football Coaching', '⚽', 1),
  ('fitness', 'Personal Training', '💪', 2),
  ('scouting', 'Scouting', '🔎', 3),
  ('performance', 'Player Analysis', '🧠', 4),
  ('medical', 'Sports Medicine', '🏥', 5),
  ('legal', 'Legal Consulting', '⚖️', 6),
  ('consulting', 'Football Management', '📊', 7),
  ('media', 'Sports Photography', '📸', 8),
  ('facilities', 'Facility Rental', '🏟', 9),
  ('travel', 'Travel Services', '✈️', 10),
  ('education', 'Education', '🎓', 11),
  ('events', 'Event Services', '🎟', 12)
on conflict (slug) do update set
  label = excluded.label,
  emoji = excluded.emoji,
  sort_order = excluded.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Swap legacy text-key table → uuid table; remap services.category_id
-- ---------------------------------------------------------------------------

do $$
declare
  legacy regclass;
begin
  legacy := to_regclass('public.service_categories');

  if legacy is null then
    alter table public.service_categories_next rename to service_categories;
    return;
  end if;

  -- Already migrated (uuid PK)?
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_categories'
      and column_name = 'slug'
  ) then
    drop table if exists public.service_categories_next;
    return;
  end if;

  if to_regclass('public.services') is not null then
    alter table public.services add column if not exists category_uuid uuid;

    update public.services s
    set category_uuid = n.id
    from public.service_categories_next n
    where s.category_id::text = n.slug;

    update public.services s
    set category_uuid = n.id
    from public.service_categories old
    join public.service_categories_next n on n.slug = old.id
    where s.category_uuid is null
      and s.category_id::text = old.id;

    alter table public.services drop constraint if exists services_category_id_fkey;
    alter table public.services drop column if exists category_id;
    alter table public.services rename column category_uuid to category_id;
  end if;

  drop table public.service_categories;
  alter table public.service_categories_next rename to service_categories;

  if to_regclass('public.services') is not null then
    alter table public.services
      add constraint services_category_id_fkey
      foreign key (category_id) references public.service_categories (id);
  end if;
end $$;

create index if not exists service_categories_sort_idx
  on public.service_categories (sort_order);

drop trigger if exists service_categories_updated_at on public.service_categories;
create trigger service_categories_updated_at
  before update on public.service_categories
  for each row execute function public.set_updated_at();

alter table public.service_categories enable row level security;

drop policy if exists categories_select on public.service_categories;
create policy categories_select on public.service_categories
  for select using (true);

notify pgrst, 'reload schema';
