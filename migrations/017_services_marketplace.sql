-- Recreate marketplace tables removed when public.profiles was dropped (006).
-- provider_id / requester_id → public.users(id). RLS uses users.user_id = auth.uid().
-- Run in Supabase SQL editor after 016.

create table if not exists public.service_categories (
  id text primary key,
  label text not null,
  emoji text not null default '',
  sort_order integer not null default 0
);

insert into public.service_categories (id, label, emoji, sort_order) values
  ('coaching', 'Football Coaching', '⚽', 1),
  ('fitness', 'Personal Training', '💪', 3),
  ('scouting', 'Scouting', '🔎', 2),
  ('performance', 'Player Analysis', '🧠', 5),
  ('medical', 'Sports Medicine', '🏥', 4),
  ('legal', 'Legal Consulting', '⚖️', 7),
  ('consulting', 'Football Management', '📊', 8),
  ('media', 'Sports Photography', '📸', 9),
  ('travel', 'Travel Services', '✈️', 11),
  ('facilities', 'Facility Rental', '🏟', 12),
  ('education', 'Education', '🎓', 13),
  ('events', 'Event Services', '🎟', 14)
on conflict (id) do update set
  label = excluded.label,
  emoji = excluded.emoji,
  sort_order = excluded.sort_order;

create table if not exists public.services (
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
      'fixed', 'starting', 'hourly', 'per_session', 'per_day', 'custom_quote', 'free'
    )
  ),
  constraint services_availability_mode_check check (
    availability_mode in ('in_person', 'online', 'both')
  )
);

create index if not exists services_provider_idx on public.services (provider_id);
create index if not exists services_category_idx on public.services (category_id);
create index if not exists services_city_idx on public.services (city);
create index if not exists services_published_idx on public.services (published);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  requester_id uuid not null references public.users (id) on delete cascade,
  provider_id uuid not null references public.users (id) on delete cascade,
  message text not null default '',
  requested_on date,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_requests_status_check check (
    status in ('pending', 'accepted', 'declined', 'completed', 'cancelled')
  )
);

create index if not exists service_requests_provider_idx
  on public.service_requests (provider_id);
create index if not exists service_requests_requester_idx
  on public.service_requests (requester_id);

create table if not exists public.service_reviews (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  request_id uuid unique references public.service_requests (id) on delete cascade,
  reviewer_id uuid not null references public.users (id) on delete cascade,
  provider_id uuid not null references public.users (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null default '',
  created_at timestamptz not null default now()
);

drop trigger if exists services_updated_at on public.services;
create trigger services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

drop trigger if exists service_requests_updated_at on public.service_requests;
create trigger service_requests_updated_at
  before update on public.service_requests
  for each row execute function public.set_updated_at();

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
    or exists (
      select 1
      from public.users u
      where u.id = services.provider_id
        and u.user_id = auth.uid()
    )
  );

drop policy if exists services_write on public.services;
create policy services_write on public.services
  for all using (
    exists (
      select 1
      from public.users u
      where u.id = services.provider_id
        and u.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = services.provider_id
        and u.user_id = auth.uid()
    )
  );

drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests
  for select using (
    exists (
      select 1
      from public.users u
      where u.user_id = auth.uid()
        and (u.id = service_requests.requester_id or u.id = service_requests.provider_id)
    )
  );

drop policy if exists service_requests_write on public.service_requests;
create policy service_requests_write on public.service_requests
  for all using (
    exists (
      select 1
      from public.users u
      where u.user_id = auth.uid()
        and (u.id = service_requests.requester_id or u.id = service_requests.provider_id)
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.user_id = auth.uid()
        and (u.id = service_requests.requester_id or u.id = service_requests.provider_id)
    )
  );

drop policy if exists service_reviews_select on public.service_reviews;
create policy service_reviews_select on public.service_reviews
  for select using (true);

drop policy if exists service_reviews_write on public.service_reviews;
create policy service_reviews_write on public.service_reviews
  for insert with check (
    exists (
      select 1
      from public.users u
      where u.id = service_reviews.reviewer_id
        and u.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
