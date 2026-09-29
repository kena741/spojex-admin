-- Events marketplace: listings, ticket codes, payments, and managers.
-- Ticket buyers get a short unique code. Managers search that code to check in/out.
-- Run after 037_stadium_admin_hours.sql. Safe to re-run.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  venue_name text not null default '',
  location text not null default '',
  address text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  ticket_price numeric(12, 2) not null default 0 check (ticket_price >= 0),
  currency text not null default 'ETB',
  capacity int not null default 0 check (capacity >= 0),
  photos jsonb not null default '[]'::jsonb,
  image_url text not null default '',
  description text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'inactive', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_status_idx on public.events (status);
create index if not exists events_starts_at_idx on public.events (starts_at);

create table if not exists public.event_managers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  manager_role text not null default 'manager'
    check (manager_role in ('owner', 'manager')),
  is_active boolean not null default true,
  login_password text not null default '',
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists event_managers_user_idx on public.event_managers (user_id);

create table if not exists public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  ticket_code text not null,
  quantity int not null default 1 check (quantity > 0),
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  currency text not null default 'ETB',
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'used')),
  guest_name text not null default '',
  guest_phone text not null default '',
  notes text not null default '',
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_tickets_code_uniq
  on public.event_tickets (ticket_code);
create index if not exists event_tickets_event_idx
  on public.event_tickets (event_id, status);
create index if not exists event_tickets_user_idx
  on public.event_tickets (user_id, status);

create table if not exists public.event_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  ticket_id uuid references public.event_tickets (id) on delete set null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'ETB',
  payment_method text not null default 'app'
    check (payment_method in ('app', 'cash')),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
  provider_ref text not null default '',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists event_payments_ticket_idx on public.event_payments (ticket_id);
create index if not exists event_payments_user_idx on public.event_payments (user_id);

create or replace function public.generate_event_ticket_code()
returns text
language plpgsql
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.event_tickets where ticket_code = code
    );
  end loop;
  return code;
end;
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_admin_permission('events:write')
    or exists (
      select 1
      from public.event_managers m
      join public.users u on u.id = m.user_id
      where m.event_id = p_event_id
        and m.is_active
        and (
          u.user_id = auth.uid()
          or u.id = auth.uid()
        )
    );
$$;

grant execute on function public.can_manage_event(uuid) to authenticated;
grant execute on function public.generate_event_ticket_code() to authenticated;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

drop trigger if exists event_tickets_set_updated_at on public.event_tickets;
create trigger event_tickets_set_updated_at
  before update on public.event_tickets
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.event_managers enable row level security;
alter table public.event_tickets enable row level security;
alter table public.event_payments enable row level security;

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select using (
    status = 'active'
    or public.can_manage_event(id)
    or public.has_admin_permission('events:read')
  );

drop policy if exists events_write on public.events;
create policy events_write on public.events
  for all using (public.has_admin_permission('events:write'))
  with check (public.has_admin_permission('events:write'));

drop policy if exists event_managers_select on public.event_managers;
create policy event_managers_select on public.event_managers
  for select using (
    public.can_manage_event(event_id)
    or public.has_admin_permission('events:read')
  );

drop policy if exists event_managers_write on public.event_managers;
create policy event_managers_write on public.event_managers
  for all using (public.has_admin_permission('events:write'))
  with check (public.has_admin_permission('events:write'));

drop policy if exists event_tickets_select on public.event_tickets;
create policy event_tickets_select on public.event_tickets
  for select using (
    public.is_current_football_user(user_id)
    or public.can_manage_event(event_id)
    or public.has_admin_permission('events:read')
  );

drop policy if exists event_tickets_insert on public.event_tickets;
create policy event_tickets_insert on public.event_tickets
  for insert with check (public.is_current_football_user(user_id));

drop policy if exists event_tickets_update on public.event_tickets;
create policy event_tickets_update on public.event_tickets
  for update using (
    public.is_current_football_user(user_id)
    or public.can_manage_event(event_id)
    or public.has_admin_permission('events:write')
  )
  with check (
    public.is_current_football_user(user_id)
    or public.can_manage_event(event_id)
    or public.has_admin_permission('events:write')
  );

drop policy if exists event_payments_select on public.event_payments;
create policy event_payments_select on public.event_payments
  for select using (
    public.is_current_football_user(user_id)
    or public.can_manage_event(event_id)
    or public.has_admin_permission('events:read')
  );

drop policy if exists event_payments_insert on public.event_payments;
create policy event_payments_insert on public.event_payments
  for insert with check (public.is_current_football_user(user_id));

drop policy if exists event_payments_update on public.event_payments;
create policy event_payments_update on public.event_payments
  for update using (
    public.is_current_football_user(user_id)
    or public.can_manage_event(event_id)
    or public.has_admin_permission('events:write')
  )
  with check (
    public.is_current_football_user(user_id)
    or public.can_manage_event(event_id)
    or public.has_admin_permission('events:write')
  );

grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.event_managers to authenticated;
grant select, insert, update, delete on public.event_tickets to authenticated;
grant select, insert, update, delete on public.event_payments to authenticated;

update public.admin_role
set permissions = array(
  select distinct unnest(permissions || array['events:read', 'events:write'])
)
where slug in ('operations_admin', 'marketplace_admin')
  and not ('events:read' = any (permissions));

update public.admin_role
set permissions = array(
  select distinct unnest(permissions || array['events:read'])
)
where slug = 'viewer'
  and not ('events:read' = any (permissions));

insert into public.events (
  id, name, slug, venue_name, location, address, starts_at, ends_at,
  ticket_price, currency, capacity, description, status, image_url
)
values
  (
    'e1000000-0000-4000-8000-000000000001',
    'Addis Night Match',
    'addis-night-match',
    'Addis Ababa Stadium',
    'Addis Ababa',
    'Meskel Square',
    timestamptz '2026-09-12 18:00:00+03',
    timestamptz '2026-09-12 21:00:00+03',
    250,
    'ETB',
    500,
    'Evening football night with live DJ and fan zone.',
    'active',
    ''
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'Youth Cup Final',
    'youth-cup-final',
    'Hawassa International Stadium',
    'Hawassa',
    'Hawassa Stadium Road',
    timestamptz '2026-09-20 15:00:00+03',
    timestamptz '2026-09-20 18:00:00+03',
    150,
    'ETB',
    800,
    'U17 cup final. Gates open 90 minutes before kickoff.',
    'active',
    ''
  )
on conflict (id) do update set
  name = excluded.name,
  ticket_price = excluded.ticket_price,
  status = excluded.status;

notify pgrst, 'reload schema';
