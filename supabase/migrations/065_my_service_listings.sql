-- Owner can always read their own listings, including unpublished.
-- Also restores services SELECT so provider_id may be public.users.id, not auth.uid().
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
  where s.provider_id = auth.uid()
     or s.provider_id = public.current_football_user_id()
     or exists (
          select 1
          from public.users u
          where u.id = s.provider_id
            and u.user_id = auth.uid()
        );
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
