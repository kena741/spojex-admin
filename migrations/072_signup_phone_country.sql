-- Persist signup phone + country on public.users.
-- handle_new_user already stored country/city/currency from auth metadata;
-- this also copies phone, and fills blank country rows so feeds can filter.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  role_text text := coalesce(nullif(meta->>'role', ''), 'fan');
  display text := coalesce(
    meta->>'display_name',
    split_part(coalesce(new.email, ''), '@', 1),
    'SpoJex member'
  );
begin
  insert into public.users (
    user_id,
    display_name,
    full_name,
    role,
    country,
    city,
    currency,
    phone
  )
  values (
    new.id,
    display,
    coalesce(meta->>'full_name', display),
    role_text,
    coalesce(nullif(meta->>'country', ''), 'Ethiopia'),
    coalesce(meta->>'city', ''),
    coalesce(meta->>'currency', 'ETB'),
    nullif(meta->>'phone', '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

update public.users
set country = 'Ethiopia'
where coalesce(trim(country), '') = '';

update public.organizations
set country = 'Ethiopia'
where coalesce(trim(country), '') = '';

update public.services
set country = 'Ethiopia'
where coalesce(trim(country), '') = '';

notify pgrst, 'reload schema';
