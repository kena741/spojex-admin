-- Athlete career timeline entries (clubs, academies, trials, loans, etc.).
-- Run after 018_athlete_profile_extras.sql.

create table if not exists public.athlete_career_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  entry_type text not null default 'club'
    check (entry_type in ('club', 'academy', 'trial', 'loan', 'national_team', 'camp')),
  organization_name text not null default '',
  organization_short_name text not null default '',
  role_title text not null default '',
  league_or_competition text not null default '',
  city text not null default '',
  country text not null default '',
  start_date date,
  end_date date,
  is_current boolean not null default false,
  matches_played integer not null default 0,
  goals integer not null default 0,
  assists integer not null default 0,
  honours text[] not null default '{}',
  summary text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_career_entries_dates_check
    check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists athlete_career_entries_user_id_idx
  on public.athlete_career_entries (user_id);

create index if not exists athlete_career_entries_user_sort_idx
  on public.athlete_career_entries (user_id, sort_order desc, start_date desc nulls last);

alter table public.athlete_career_entries enable row level security;

drop policy if exists athlete_career_entries_select on public.athlete_career_entries;
drop policy if exists athlete_career_entries_write on public.athlete_career_entries;

create policy athlete_career_entries_select
  on public.athlete_career_entries for select using (true);

create policy athlete_career_entries_write
  on public.athlete_career_entries for all
  using (user_id in (select id from public.users where user_id = auth.uid()))
  with check (user_id in (select id from public.users where user_id = auth.uid()));

drop trigger if exists athlete_career_entries_updated_at on public.athlete_career_entries;

create trigger athlete_career_entries_updated_at
  before update on public.athlete_career_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Demo career timeline for one player (Alex Tesfaye profile when present,
-- otherwise the earliest player account).
-- ---------------------------------------------------------------------------

do $$
declare
  v_user_id uuid;
begin
  select u.id
  into v_user_id
  from public.users u
  where u.role = 'player'
  order by
    case
      when u.display_name ilike '%Alex Tesfaye%' then 0
      when u.display_name ilike '%Alex%' then 1
      else 2
    end,
    u.created_at
  limit 1;

  if v_user_id is null then
    return;
  end if;

  if exists (
    select 1 from public.athlete_career_entries where user_id = v_user_id
  ) then
    return;
  end if;

  insert into public.athlete_career_entries (
    user_id,
    entry_type,
    organization_name,
    organization_short_name,
    role_title,
    league_or_competition,
    city,
    country,
    start_date,
    end_date,
    is_current,
    matches_played,
    goals,
    assists,
    honours,
    summary,
    sort_order
  ) values
  (
    v_user_id,
    'club',
    'Addis Ababa City FC',
    'AACFC',
    'Centre Midfielder',
    'Ethiopian Premier League',
    'Addis Ababa',
    'Ethiopia',
    date '2024-01-15',
    null,
    true,
    48,
    9,
    14,
    array[
      'Player of the Month — Sep 2024',
      'U23 squad captain',
      'Premier League Team of the Week (x2)'
    ],
    'First-team regular after academy promotion. Leads build-up play, set-piece delivery, and pressing triggers in a double-pivot.',
    100
  ),
  (
    v_user_id,
    'loan',
    'Hawassa Kenema FC',
    'HKFC',
    'Central Midfielder',
    'Ethiopian Premier League',
    'Hawassa',
    'Ethiopia',
    date '2023-08-01',
    date '2023-12-20',
    false,
    18,
    2,
    5,
    array['Loan spell — senior minutes'],
    'Six-month loan to gain top-flight minutes. Featured in cup run and defensive midfield rotations.',
    90
  ),
  (
    v_user_id,
    'academy',
    'Addis Ababa City FC Academy',
    'AAC Academy',
    'Attacking Midfielder',
    'U20 League',
    'Addis Ababa',
    'Ethiopia',
    date '2020-09-01',
    date '2023-07-31',
    false,
    58,
    12,
    18,
    array[
      'Academy Player of the Year 2021',
      'U20 league top assists 2022'
    ],
    'Three-year academy pathway with progressive role changes from wide midfielder to number eight.',
    80
  ),
  (
    v_user_id,
    'academy',
    'Saint George SA Youth',
    'St. George',
    'Left Winger',
    'Addis Ababa Youth League U17',
    'Addis Ababa',
    'Ethiopia',
    date '2018-03-01',
    date '2020-08-31',
    false,
    41,
    7,
    9,
    array['Regional U17 finalist 2019'],
    'Foundations in dribbling, crossing, and transition play before moving to AAC academy.',
    70
  ),
  (
    v_user_id,
    'trial',
    'Ethiopian Coffee SC',
    'Coffee SC',
    'Trial — Midfielder',
    'Pre-season assessment',
    'Addis Ababa',
    'Ethiopia',
    date '2019-12-02',
    date '2019-12-16',
    false,
    3,
    0,
    1,
    array[]::text[],
    'Two-week senior trial during winter break. Recommended for academy intake at AAC.',
    60
  ),
  (
    v_user_id,
    'camp',
    'Ethiopian FA Talent ID Camp',
    'EFA Camp',
    'Invited midfielder',
    'National talent identification',
    'Addis Ababa',
    'Ethiopia',
    date '2017-07-10',
    date '2017-07-24',
    false,
    6,
    1,
    2,
    array['Camp standout — midfield group'],
    'National federation identification camp before joining St. George youth setup.',
    50
  );

  update public.users
  set
    display_name = case
      when coalesce(display_name, '') = '' then 'Alex Tesfaye'
      else display_name
    end,
    headline = case
      when coalesce(headline, '') = '' then 'Centre Midfielder · Addis Ababa City FC'
      else headline
    end,
    city = case when coalesce(city, '') = '' then 'Addis Ababa' else city end,
    country = case when coalesce(country, '') = '' then 'Ethiopia' else country end,
    verified = true
  where id = v_user_id;

  insert into public.athlete_profiles (
    id,
    user_id,
    position,
    secondary_position,
    preferred_foot,
    team,
    nationality,
    playing_level,
    height_cm,
    weight_kg,
    jersey_number,
    date_of_birth,
    years_experience,
    matches_played,
    goals,
    assists,
    man_of_the_match
  ) values (
    v_user_id,
    v_user_id,
    'Centre Midfielder',
    'Attacking Midfielder',
    'Right',
    'Addis Ababa City FC',
    'Ethiopian',
    'Professional',
    178,
    72,
    8,
    date '2003-05-14',
    7,
    178,
    31,
    49,
    11
  )
  on conflict (id) do update set
    position = excluded.position,
    secondary_position = excluded.secondary_position,
    preferred_foot = excluded.preferred_foot,
    team = excluded.team,
    nationality = excluded.nationality,
    playing_level = excluded.playing_level,
    height_cm = excluded.height_cm,
    weight_kg = excluded.weight_kg,
    jersey_number = excluded.jersey_number,
    date_of_birth = excluded.date_of_birth,
    years_experience = excluded.years_experience,
    matches_played = excluded.matches_played,
    goals = excluded.goals,
    assists = excluded.assists,
    man_of_the_match = excluded.man_of_the_match,
    updated_at = now();

end $$;

notify pgrst, 'reload schema';
