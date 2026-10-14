-- Listings wait for admin approval. Providers cannot publish themselves.
-- Run after 062_service_images.sql. Safe to re-run.

create or replace function public.enforce_service_admin_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', auth.role()) = 'service_role' then
    return new;
  end if;
  if public.has_admin_permission('services:write') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.published := false;
    return new;
  end if;
  new.published := old.published;
  return new;
end;
$$;

drop trigger if exists services_admin_publish on public.services;
create trigger services_admin_publish
  before insert or update on public.services
  for each row execute function public.enforce_service_admin_publish();

drop policy if exists services_insert on public.services;
create policy services_insert on public.services
  for insert with check (
    public.is_current_football_user(provider_id)
    and public.can_offer_marketplace_services()
    and published = false
  );

notify pgrst, 'reload schema';
