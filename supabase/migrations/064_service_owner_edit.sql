-- Owners may unpublish a listing (edits go back to review) but cannot publish.
-- Run after 063_service_admin_approval.sql. Safe to re-run.

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
  if new.published is true and old.published is not true then
    new.published := false;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
