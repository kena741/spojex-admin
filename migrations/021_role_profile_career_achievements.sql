-- Shared career timeline + achievements JSONB for athlete, professional, and media profiles.
-- Run after 020_athlete_career_history_jsonb.sql.

-- ---------------------------------------------------------------------------
-- Shared validators
-- ---------------------------------------------------------------------------

create or replace function public.valid_role_career_history(doc jsonb)
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
      -- athlete
      'club', 'academy', 'trial', 'loan', 'national_team', 'camp',
      -- professional (coach, scout, agent, referee, …)
      'club_staff', 'academy_staff', 'national_team_staff', 'federation',
      'consultancy', 'freelance', 'other',
      -- media
      'outlet', 'broadcast', 'publication', 'event'
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

create or replace function public.valid_role_achievements(doc jsonb)
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
    if coalesce(entry->>'title', '') = '' then
      return false;
    end if;
    if coalesce(entry->>'category', 'other') not in (
      'trophy', 'award', 'certification', 'milestone', 'honour', 'other'
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- Align athlete constraint with shared validator (superset of entry types).
alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_career_history_check;

alter table public.athlete_profiles
  add constraint athlete_profiles_career_history_check
  check (public.valid_role_career_history(career_history));

-- ---------------------------------------------------------------------------
-- Achievements on athlete_profiles
-- ---------------------------------------------------------------------------

alter table public.athlete_profiles
  add column if not exists achievements jsonb not null
  default '{"version":1,"entries":[]}'::jsonb;

alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_achievements_check;

alter table public.athlete_profiles
  add constraint athlete_profiles_achievements_check
  check (public.valid_role_achievements(achievements));

create index if not exists athlete_profiles_achievements_gin_idx
  on public.athlete_profiles using gin (achievements jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Career + achievements on professional_profiles
-- ---------------------------------------------------------------------------

alter table public.professional_profiles
  add column if not exists career_history jsonb not null
  default '{"version":1,"entries":[]}'::jsonb;

alter table public.professional_profiles
  drop constraint if exists professional_profiles_career_history_check;

alter table public.professional_profiles
  add constraint professional_profiles_career_history_check
  check (public.valid_role_career_history(career_history));

create index if not exists professional_profiles_career_history_gin_idx
  on public.professional_profiles using gin (career_history jsonb_path_ops);

alter table public.professional_profiles
  add column if not exists achievements jsonb not null
  default '{"version":1,"entries":[]}'::jsonb;

alter table public.professional_profiles
  drop constraint if exists professional_profiles_achievements_check;

alter table public.professional_profiles
  add constraint professional_profiles_achievements_check
  check (public.valid_role_achievements(achievements));

create index if not exists professional_profiles_achievements_gin_idx
  on public.professional_profiles using gin (achievements jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Career + achievements on media_profiles
-- ---------------------------------------------------------------------------

alter table public.media_profiles
  add column if not exists career_history jsonb not null
  default '{"version":1,"entries":[]}'::jsonb;

alter table public.media_profiles
  drop constraint if exists media_profiles_career_history_check;

alter table public.media_profiles
  add constraint media_profiles_career_history_check
  check (public.valid_role_career_history(career_history));

create index if not exists media_profiles_career_history_gin_idx
  on public.media_profiles using gin (career_history jsonb_path_ops);

alter table public.media_profiles
  add column if not exists achievements jsonb not null
  default '{"version":1,"entries":[]}'::jsonb;

alter table public.media_profiles
  drop constraint if exists media_profiles_achievements_check;

alter table public.media_profiles
  add constraint media_profiles_achievements_check
  check (public.valid_role_achievements(achievements));

create index if not exists media_profiles_achievements_gin_idx
  on public.media_profiles using gin (achievements jsonb_path_ops);
