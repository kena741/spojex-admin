-- Extra athlete profile fields for player startup profile.
-- Run after 017_services_marketplace.sql.

alter table public.athlete_profiles
  add column if not exists secondary_position text not null default '',
  add column if not exists nationality text not null default '',
  add column if not exists playing_level text not null default '',
  add column if not exists man_of_the_match integer not null default 0,
  add column if not exists looking_for_opportunities boolean not null default false,
  add column if not exists opportunity_interests text[] not null default '{}';

notify pgrst, 'reload schema';
