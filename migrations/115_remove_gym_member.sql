-- Owner or admin can remove a gym member and drop them from the gym chat.
-- Safe to re-run.

create or replace function public.remove_gym_member(p_gym_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_me uuid := public.current_football_user_id();
  v_member public.gym_members%rowtype;
  v_org_id uuid;
  v_group uuid;
  v_allowed boolean := false;
begin
  if p_gym_id is null or p_member_id is null then
    return jsonb_build_object('ok', false, 'error', 'Missing gym or member');
  end if;

  if coalesce(auth.jwt() ->> 'role', auth.role()) = 'service_role'
     or public.is_spojex_admin()
     or public.has_admin_permission('gyms:write') then
    v_allowed := true;
  elsif v_me is not null and (
    exists (
      select 1 from public.gyms g
      where g.id = p_gym_id
        and g.owner_user_id = v_me
    )
    or exists (
      select 1 from public.gym_staff s
      where s.gym_id = p_gym_id
        and s.user_id = v_me
        and s.is_active
        and s.staff_role = 'owner'
    )
  ) then
    v_allowed := true;
  end if;

  if not v_allowed then
    return jsonb_build_object('ok', false, 'error', 'Only the gym owner can remove members');
  end if;

  select * into v_member
  from public.gym_members
  where id = p_member_id
    and gym_id = p_gym_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Member not found');
  end if;

  if v_member.user_id is not null
     and not exists (
       select 1 from public.gym_staff s
       where s.gym_id = p_gym_id
         and s.user_id = v_member.user_id
         and s.is_active
     )
     and not exists (
       select 1 from public.gyms g
       where g.id = p_gym_id
         and g.owner_user_id = v_member.user_id
     ) then
    select organization_id into v_org_id
    from public.gyms
    where id = p_gym_id;

    if v_org_id is not null then
      update public.organization_members
      set status = 'left'
      where organization_id = v_org_id
        and user_id = v_member.user_id
        and member_role <> 'owner';

      select id into v_group
      from public.conversations
      where organization_id = v_org_id
        and type = 'organization'
        and org_thread_kind = 'group'
      limit 1;

      if v_group is not null then
        delete from public.conversation_members
        where conversation_id = v_group
          and user_id = v_member.user_id;
      end if;
    end if;
  end if;

  delete from public.gym_members
  where id = v_member.id;

  return jsonb_build_object('ok', true, 'member_id', p_member_id);
end;
$$;

grant execute on function public.remove_gym_member(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
