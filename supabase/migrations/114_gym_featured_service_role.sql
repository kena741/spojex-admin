-- Allow admin service_role client to set gym featuring (auth.uid() is null).
-- Safe to re-run. Idempotent with 113_gym_featured.sql.

create or replace function public.gyms_guard_featured_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', auth.role()) = 'service_role'
     or public.is_spojex_admin()
     or public.has_admin_permission('gyms:write') then
    return NEW;
  end if;

  if NEW.is_featured is distinct from OLD.is_featured then
    NEW.is_featured := OLD.is_featured;
  end if;

  if NEW.feature_reviewed_at is distinct from OLD.feature_reviewed_at then
    NEW.feature_reviewed_at := OLD.feature_reviewed_at;
  end if;

  if NEW.feature_status is distinct from OLD.feature_status then
    if NEW.feature_status = 'pending'
       and OLD.feature_status in ('none', 'rejected')
       and coalesce(NEW.is_featured, false) = false then
      NEW.feature_requested_at := coalesce(NEW.feature_requested_at, now());
    else
      NEW.feature_status := OLD.feature_status;
      NEW.feature_requested_at := OLD.feature_requested_at;
    end if;
  end if;

  return NEW;
end;
$$;
