-- Owner can always read their own listings, including unpublished.
-- provider_id is public.users.id — match current_football_user_id() only.
-- Safe to re-run.

create or replace function public.my_service_listings()
returns setof public.services
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.services s
  where s.provider_id = public.current_football_user_id();
$$;

grant execute on function public.my_service_listings() to authenticated;
grant execute on function public.my_service_listings() to service_role;

drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select using (
    published = true
    or public.is_current_football_user(provider_id)
  );

notify pgrst, 'reload schema';
