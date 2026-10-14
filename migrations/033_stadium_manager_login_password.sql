-- Store the stadium manager login password so admins can view and share it.
-- Manager remains a regular app user (fan/parent/player). Safe to re-run.

alter table public.stadium_managers
  add column if not exists login_password text not null default '';

notify pgrst, 'reload schema';
