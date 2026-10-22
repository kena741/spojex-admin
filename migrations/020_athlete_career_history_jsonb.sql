-- Store athlete career timeline as JSONB on athlete_profiles.
-- Replaces public.athlete_career_entries (migration 019) with a versioned document.
-- Run after 019_athlete_career_history.sql (or standalone if 019 was skipped).

-- ---------------------------------------------------------------------------
-- JSONB column + validation
-- ---------------------------------------------------------------------------

alter table public.athlete_profiles
  add column if not exists career_history jsonb not null
  default '{"version":1,"entries":[]}'::jsonb;

create or replace function public.valid_athlete_career_history(doc jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  entry jsonb;
begin
  if jsonb_typeof(doc) <> 'object' then
    return false;
  end if;
  if (doc ? 'version') is false or (doc->>'version') !~ '^[0-9]+$' then
    return false;
  end if;
  if jsonb_typeof(doc->'entries') <> 'array' then
    return false;
  end if;

  for entry in select value from jsonb_array_elements(doc->'entries') loop
    if jsonb_typeof(entry) <> 'object' then
      return false;
    end if;
    if coalesce(entry->>'entry_type', '') not in (
      'club', 'academy', 'trial', 'loan', 'national_team', 'camp'
    ) then
      return false;
    end if;
    if coalesce(entry->'organization'->>'name', '') = '' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_career_history_check;

alter table public.athlete_profiles
  add constraint athlete_profiles_career_history_check
  check (public.valid_athlete_career_history(career_history));

create index if not exists athlete_profiles_career_history_gin_idx
  on public.athlete_profiles using gin (career_history jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Migrate legacy rows from athlete_career_entries → JSONB (if table exists)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.athlete_career_entries') is null then
    return;
  end if;

  update public.athlete_profiles ap
  set career_history = jsonb_build_object(
    'version', 1,
    'updated_at', to_jsonb(now()),
    'entries', coalesce(src.entries, '[]'::jsonb)
  )
  from (
    select
      e.user_id,
      jsonb_agg(
        jsonb_build_object(
          'id', e.id::text,
          'entry_type', e.entry_type,
          'organization', jsonb_build_object(
            'name', e.organization_name,
            'short_name', e.organization_short_name
          ),
          'role', jsonb_build_object(
            'title', e.role_title,
            'league_or_competition', e.league_or_competition
          ),
          'location', jsonb_build_object(
            'city', e.city,
            'country', e.country
          ),
          'period', jsonb_build_object(
            'start_date', e.start_date,
            'end_date', e.end_date,
            'is_current', e.is_current
          ),
          'stats', jsonb_build_object(
            'matches_played', e.matches_played,
            'goals', e.goals,
            'assists', e.assists
          ),
          'honours', to_jsonb(e.honours),
          'summary', e.summary,
          'sort_order', e.sort_order
        )
        order by e.sort_order desc, e.start_date desc nulls last
      ) as entries
    from public.athlete_career_entries e
    group by e.user_id
  ) src
  where ap.user_id = src.user_id;

  drop table public.athlete_career_entries;
end $$;

-- ---------------------------------------------------------------------------
-- Demo JSONB timeline for one player (when career_history is still empty)
-- ---------------------------------------------------------------------------

do $$
declare
  v_user_id uuid;
  v_demo jsonb := $json$
{
  "version": 1,
  "updated_at": "2026-09-02T00:00:00Z",
  "entries": [
    {
      "id": "career-aacfc-current",
      "entry_type": "club",
      "organization": { "name": "Addis Ababa City FC", "short_name": "AACFC" },
      "role": { "title": "Centre Midfielder", "league_or_competition": "Ethiopian Premier League" },
      "location": { "city": "Addis Ababa", "country": "Ethiopia" },
      "period": { "start_date": "2024-01-15", "end_date": null, "is_current": true },
      "stats": { "matches_played": 48, "goals": 9, "assists": 14 },
      "honours": [
        "Player of the Month - Sep 2024",
        "U23 squad captain",
        "Premier League Team of the Week (x2)"
      ],
      "summary": "First-team regular after academy promotion. Leads build-up play, set-piece delivery, and pressing triggers in a double-pivot.",
      "sort_order": 100
    },
    {
      "id": "career-hawassa-loan",
      "entry_type": "loan",
      "organization": { "name": "Hawassa Kenema FC", "short_name": "HKFC" },
      "role": { "title": "Central Midfielder", "league_or_competition": "Ethiopian Premier League" },
      "location": { "city": "Hawassa", "country": "Ethiopia" },
      "period": { "start_date": "2023-08-01", "end_date": "2023-12-20", "is_current": false },
      "stats": { "matches_played": 18, "goals": 2, "assists": 5 },
      "honours": ["Loan spell - senior minutes"],
      "summary": "Six-month loan to gain top-flight minutes. Featured in cup run and defensive midfield rotations.",
      "sort_order": 90
    },
    {
      "id": "career-aac-academy",
      "entry_type": "academy",
      "organization": { "name": "Addis Ababa City FC Academy", "short_name": "AAC Academy" },
      "role": { "title": "Attacking Midfielder", "league_or_competition": "U20 League" },
      "location": { "city": "Addis Ababa", "country": "Ethiopia" },
      "period": { "start_date": "2020-09-01", "end_date": "2023-07-31", "is_current": false },
      "stats": { "matches_played": 58, "goals": 12, "assists": 18 },
      "honours": ["Academy Player of the Year 2021", "U20 league top assists 2022"],
      "summary": "Three-year academy pathway with progressive role changes from wide midfielder to number eight.",
      "sort_order": 80
    },
    {
      "id": "career-st-george-youth",
      "entry_type": "academy",
      "organization": { "name": "Saint George SA Youth", "short_name": "St. George" },
      "role": { "title": "Left Winger", "league_or_competition": "Addis Ababa Youth League U17" },
      "location": { "city": "Addis Ababa", "country": "Ethiopia" },
      "period": { "start_date": "2018-03-01", "end_date": "2020-08-31", "is_current": false },
      "stats": { "matches_played": 41, "goals": 7, "assists": 9 },
      "honours": ["Regional U17 finalist 2019"],
      "summary": "Foundations in dribbling, crossing, and transition play before moving to AAC academy.",
      "sort_order": 70
    },
    {
      "id": "career-coffee-trial",
      "entry_type": "trial",
      "organization": { "name": "Ethiopian Coffee SC", "short_name": "Coffee SC" },
      "role": { "title": "Trial - Midfielder", "league_or_competition": "Pre-season assessment" },
      "location": { "city": "Addis Ababa", "country": "Ethiopia" },
      "period": { "start_date": "2019-12-02", "end_date": "2019-12-16", "is_current": false },
      "stats": { "matches_played": 3, "goals": 0, "assists": 1 },
      "honours": [],
      "summary": "Two-week senior trial during winter break. Recommended for academy intake at AAC.",
      "sort_order": 60
    },
    {
      "id": "career-efa-camp",
      "entry_type": "camp",
      "organization": { "name": "Ethiopian FA Talent ID Camp", "short_name": "EFA Camp" },
      "role": { "title": "Invited midfielder", "league_or_competition": "National talent identification" },
      "location": { "city": "Addis Ababa", "country": "Ethiopia" },
      "period": { "start_date": "2017-07-10", "end_date": "2017-07-24", "is_current": false },
      "stats": { "matches_played": 6, "goals": 1, "assists": 2 },
      "honours": ["Camp standout - midfield group"],
      "summary": "National federation identification camp before joining St. George youth setup.",
      "sort_order": 50
    }
  ]
}
$json$::jsonb;
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

  update public.athlete_profiles
  set career_history = v_demo
  where user_id = v_user_id
    and career_history = '{"version":1,"entries":[]}'::jsonb;
end $$;

notify pgrst, 'reload schema';
