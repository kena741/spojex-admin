-- Create marketplace tables if 017/022 were never applied, then
-- let coaches/scouts/agents list and anyone book.
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

do $$
declare
  cat_id_type text;
begin
  if to_regclass('public.service_categories') is null then
    create table public.service_categories (
      id uuid primary key default gen_random_uuid(),
      slug text not null unique,
      label text not null,
      emoji text not null default '',
      sort_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  elsif not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_categories'
      and column_name = 'slug'
  ) then
    alter table public.service_categories add column slug text;
    update public.service_categories set slug = id::text where slug is null;
    create unique index if not exists service_categories_slug_key
      on public.service_categories (slug);
  end if;

  select c.data_type into cat_id_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'service_categories'
    and c.column_name = 'id';

  if to_regclass('public.services') is null then
    if cat_id_type = 'uuid' then
      execute $sql$
        create table public.services (
          id uuid primary key default gen_random_uuid(),
          provider_id uuid not null references public.users (id) on delete cascade,
          category_id uuid not null references public.service_categories (id),
          title text not null,
          description text not null default '',
          country text not null default '',
          city text not null default '',
          pricing_type text not null default 'starting',
          price_amount numeric(12, 2),
          currency text not null default 'ETB',
          availability_mode text not null default 'in_person',
          duration_minutes integer,
          service_area text not null default '',
          cover_url text,
          published boolean not null default false,
          rating_avg numeric(3, 2) not null default 0,
          review_count integer not null default 0,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint services_pricing_type_check check (
            pricing_type in (
              'fixed', 'starting', 'hourly', 'per_session', 'per_day',
              'custom_quote', 'free'
            )
          ),
          constraint services_availability_mode_check check (
            availability_mode in ('in_person', 'online', 'both')
          )
        )
      $sql$;
    else
      execute $sql$
        create table public.services (
          id uuid primary key default gen_random_uuid(),
          provider_id uuid not null references public.users (id) on delete cascade,
          category_id text not null references public.service_categories (id),
          title text not null,
          description text not null default '',
          country text not null default '',
          city text not null default '',
          pricing_type text not null default 'starting',
          price_amount numeric(12, 2),
          currency text not null default 'ETB',
          availability_mode text not null default 'in_person',
          duration_minutes integer,
          service_area text not null default '',
          cover_url text,
          published boolean not null default false,
          rating_avg numeric(3, 2) not null default 0,
          review_count integer not null default 0,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint services_pricing_type_check check (
            pricing_type in (
              'fixed', 'starting', 'hourly', 'per_session', 'per_day',
              'custom_quote', 'free'
            )
          ),
          constraint services_availability_mode_check check (
            availability_mode in ('in_person', 'online', 'both')
          )
        )
      $sql$;
    end if;
  end if;

  if to_regclass('public.service_requests') is null then
    create table public.service_requests (
      id uuid primary key default gen_random_uuid(),
      service_id uuid not null references public.services (id) on delete cascade,
      requester_id uuid not null references public.users (id) on delete cascade,
      provider_id uuid not null references public.users (id) on delete cascade,
      message text not null default '',
      location text not null default '',
      requested_on date,
      requested_at timestamptz,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint service_requests_status_check check (
        status in ('pending', 'accepted', 'declined', 'completed', 'cancelled')
      )
    );
  end if;

  if to_regclass('public.service_reviews') is null then
    create table public.service_reviews (
      id uuid primary key default gen_random_uuid(),
      service_id uuid not null references public.services (id) on delete cascade,
      request_id uuid unique references public.service_requests (id) on delete cascade,
      reviewer_id uuid not null references public.users (id) on delete cascade,
      provider_id uuid not null references public.users (id) on delete cascade,
      rating integer not null check (rating between 1 and 5),
      body text not null default '',
      created_at timestamptz not null default now()
    );
  end if;
end $$;

create index if not exists services_provider_idx on public.services (provider_id);
create index if not exists services_category_idx on public.services (category_id);
create index if not exists services_city_idx on public.services (city);
create index if not exists services_published_idx on public.services (published);
create index if not exists service_requests_provider_idx
  on public.service_requests (provider_id);
create index if not exists service_requests_requester_idx
  on public.service_requests (requester_id);
create index if not exists service_categories_sort_idx
  on public.service_categories (sort_order);

drop trigger if exists services_updated_at on public.services;
create trigger services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

drop trigger if exists service_requests_updated_at on public.service_requests;
create trigger service_requests_updated_at
  before update on public.service_requests
  for each row execute function public.set_updated_at();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_categories'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    insert into public.service_categories (slug, label, emoji, sort_order)
    values
      ('coaching', 'Football Coaching', '⚽', 1),
      ('fitness', 'Personal Training', '💪', 2),
      ('scouting', 'Scouting', '🔎', 3),
      ('performance', 'Player Analysis', '🧠', 4),
      ('medical', 'Sports Medicine', '🏥', 5),
      ('legal', 'Legal Consulting', '⚖️', 6),
      ('consulting', 'Football Management', '📊', 7),
      ('representation', 'Player Representation', '🤝', 8),
      ('media', 'Sports Photography', '📸', 9),
      ('facilities', 'Facility Rental', '🏟', 10),
      ('travel', 'Travel Services', '✈️', 11),
      ('education', 'Education', '🎓', 12),
      ('events', 'Event Services', '🎟', 13)
    on conflict (slug) do update set
      label = excluded.label,
      emoji = excluded.emoji,
      sort_order = excluded.sort_order;
  else
    insert into public.service_categories (id, label, emoji, sort_order)
    values
      ('coaching', 'Football Coaching', '⚽', 1),
      ('fitness', 'Personal Training', '💪', 2),
      ('scouting', 'Scouting', '🔎', 3),
      ('performance', 'Player Analysis', '🧠', 4),
      ('medical', 'Sports Medicine', '🏥', 5),
      ('legal', 'Legal Consulting', '⚖️', 6),
      ('consulting', 'Football Management', '📊', 7),
      ('representation', 'Player Representation', '🤝', 8),
      ('media', 'Sports Photography', '📸', 9),
      ('facilities', 'Facility Rental', '🏟', 10),
      ('travel', 'Travel Services', '✈️', 11),
      ('education', 'Education', '🎓', 12),
      ('events', 'Event Services', '🎟', 13)
    on conflict (id) do update set
      label = excluded.label,
      emoji = excluded.emoji,
      sort_order = excluded.sort_order;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'service_categories'
        and column_name = 'slug'
    ) then
      update public.service_categories set slug = id::text where slug is null;
    end if;
  end if;
end $$;

alter table public.service_requests
  add column if not exists location text not null default '';

alter table public.service_requests
  add column if not exists requested_at timestamptz;

grant select, insert, update, delete on table public.service_categories to authenticated;
grant select, insert, update, delete on table public.services to authenticated;
grant select, insert, update, delete on table public.service_requests to authenticated;
grant select, insert on table public.service_reviews to authenticated;

alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.service_requests enable row level security;
alter table public.service_reviews enable row level security;

drop policy if exists categories_select on public.service_categories;
create policy categories_select on public.service_categories
  for select using (true);

drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select using (
    published = true
    or public.is_current_football_user(provider_id)
  );

create or replace function public.can_offer_marketplace_services()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where public.is_current_football_user(u.id)
      and u.role in ('coach', 'scout', 'agent')
  );
$$;

grant execute on function public.can_offer_marketplace_services() to authenticated;

drop policy if exists services_write on public.services;
drop policy if exists services_insert on public.services;
drop policy if exists services_update on public.services;
drop policy if exists services_delete on public.services;

create policy services_insert on public.services
  for insert with check (
    public.is_current_football_user(provider_id)
    and public.can_offer_marketplace_services()
  );

create policy services_update on public.services
  for update using (public.is_current_football_user(provider_id))
  with check (public.is_current_football_user(provider_id));

create policy services_delete on public.services
  for delete using (public.is_current_football_user(provider_id));

drop policy if exists service_requests_write on public.service_requests;
drop policy if exists service_requests_insert on public.service_requests;
drop policy if exists service_requests_update on public.service_requests;
drop policy if exists service_requests_delete on public.service_requests;
drop policy if exists service_requests_select on public.service_requests;

create policy service_requests_select on public.service_requests
  for select using (
    public.is_current_football_user(requester_id)
    or public.is_current_football_user(provider_id)
  );

create policy service_requests_insert on public.service_requests
  for insert with check (
    public.is_current_football_user(requester_id)
    and requester_id is distinct from provider_id
    and exists (
      select 1
      from public.services s
      where s.id = service_id
        and s.published = true
        and s.provider_id = service_requests.provider_id
    )
  );

create policy service_requests_update on public.service_requests
  for update using (
    public.is_current_football_user(requester_id)
    or public.is_current_football_user(provider_id)
  )
  with check (
    public.is_current_football_user(requester_id)
    or public.is_current_football_user(provider_id)
  );

create policy service_requests_delete on public.service_requests
  for delete using (
    public.is_current_football_user(requester_id)
    or public.is_current_football_user(provider_id)
  );

drop policy if exists service_reviews_select on public.service_reviews;
create policy service_reviews_select on public.service_reviews
  for select using (true);

drop policy if exists service_reviews_write on public.service_reviews;
create policy service_reviews_write on public.service_reviews
  for insert with check (public.is_current_football_user(reviewer_id));

notify pgrst, 'reload schema';
