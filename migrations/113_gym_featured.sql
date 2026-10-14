-- Gym featuring: owners/managers request; admins approve or set manually.
-- Safe to re-run.

alter table public.gyms
  add column if not exists is_featured boolean not null default false;

alter table public.gyms
  add column if not exists feature_status text not null default 'none';

alter table public.gyms
  add column if not exists feature_requested_at timestamptz;

alter table public.gyms
  add column if not exists feature_reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gyms_feature_status_check'
      and conrelid = 'public.gyms'::regclass
  ) then
    alter table public.gyms
      add constraint gyms_feature_status_check
      check (feature_status in ('none', 'pending', 'approved', 'rejected'));
  end if;
end $$;

-- Align legacy rows if column existed without constraint values.
update public.gyms
set feature_status = case
  when is_featured then 'approved'
  when feature_status is null or feature_status = '' then 'none'
  else feature_status
end
where feature_status is null
   or feature_status = ''
   or (is_featured and feature_status <> 'approved');

create index if not exists gyms_featured_idx
  on public.gyms (is_featured desc, status, created_at desc)
  where status = 'active';

create index if not exists gyms_feature_status_idx
  on public.gyms (feature_status, feature_requested_at desc nulls last);

comment on column public.gyms.is_featured is
  'Shown in gym home Featured carousel when true.';
comment on column public.gyms.feature_status is
  'Feature request lifecycle: none | pending | approved | rejected.';
comment on column public.gyms.feature_requested_at is
  'When the owner/manager last requested featured placement.';
comment on column public.gyms.feature_reviewed_at is
  'When an admin last approved, rejected, or manually changed featuring.';

-- Non-admins cannot self-approve featuring; request RPC / limited pending transition only.
create or replace function public.gyms_guard_featured_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin panel uses the service_role key (auth.uid() is null).
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

drop trigger if exists gyms_guard_featured on public.gyms;
create trigger gyms_guard_featured
  before update on public.gyms
  for each row execute function public.gyms_guard_featured_columns();

-- Owner or manager staff requests featured placement.
create or replace function public.request_gym_featured(p_gym_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_football_user_id();
  v_gym public.gyms%rowtype;
  v_can boolean := false;
begin
  if auth.uid() is null or me is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  select * into v_gym from public.gyms where id = p_gym_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'gym_not_found');
  end if;

  if v_gym.owner_user_id = me then
    v_can := true;
  elsif exists (
    select 1 from public.gym_staff s
    where s.gym_id = p_gym_id
      and s.user_id = me
      and s.is_active
      and s.staff_role in ('owner', 'manager')
  ) then
    v_can := true;
  end if;

  if not v_can then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  if v_gym.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  if v_gym.is_featured or v_gym.feature_status = 'approved' then
    return jsonb_build_object('ok', false, 'error', 'already_featured');
  end if;

  if v_gym.feature_status = 'pending' then
    return jsonb_build_object('ok', false, 'error', 'already_pending');
  end if;

  update public.gyms
  set
    feature_status = 'pending',
    feature_requested_at = now(),
    is_featured = false,
    updated_at = now()
  where id = p_gym_id
  returning * into v_gym;

  return jsonb_build_object(
    'ok', true,
    'gym_id', v_gym.id,
    'feature_status', v_gym.feature_status,
    'feature_requested_at', v_gym.feature_requested_at,
    'is_featured', v_gym.is_featured
  );
end;
$$;

grant execute on function public.request_gym_featured(uuid) to authenticated;

notify pgrst, 'reload schema';
