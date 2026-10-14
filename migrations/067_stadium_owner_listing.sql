-- Owner self-serve stadium listing: register, photos, and manager assignment.
-- Safe to re-run.

-- Pending listings are owner-submitted. Only admins may insert as active.
drop policy if exists stadiums_manager_write on public.stadiums;
create policy stadiums_manager_write on public.stadiums
  for insert
  with check (
    auth.uid() is not null
    and (
      status = 'pending'
      or public.has_admin_permission('stadiums:write')
    )
  );

-- Owners may assign themselves after creating the venue.
drop policy if exists stadium_managers_owner_insert on public.stadium_managers;
create policy stadium_managers_owner_insert on public.stadium_managers
  for insert
  with check (
    manager_role = 'owner'
    and (
      user_id = auth.uid()
      or user_id in (select u.id from public.users u where u.user_id = auth.uid())
    )
    and exists (
      select 1
      from public.stadiums s
      where s.id = stadium_id
        and (
          s.owner_user_id = user_id
          or s.owner_user_id in (
            select u.id from public.users u where u.user_id = auth.uid()
          )
        )
    )
  );

-- Managers and admins can upload photos into {stadium_id}/...
drop policy if exists stadiums_storage_admin_insert on storage.objects;
create policy stadiums_storage_admin_insert on storage.objects
  for insert
  with check (
    bucket_id = 'stadiums'
    and (
      public.is_spojex_admin()
      or public.has_admin_permission('stadiums:write')
      or (
        split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
        and public.can_manage_stadium(split_part(name, '/', 1)::uuid)
      )
    )
  );

drop policy if exists stadiums_storage_admin_update on storage.objects;
create policy stadiums_storage_admin_update on storage.objects
  for update
  using (
    bucket_id = 'stadiums'
    and (
      public.is_spojex_admin()
      or public.has_admin_permission('stadiums:write')
      or (
        split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
        and public.can_manage_stadium(split_part(name, '/', 1)::uuid)
      )
    )
  )
  with check (
    bucket_id = 'stadiums'
    and (
      public.is_spojex_admin()
      or public.has_admin_permission('stadiums:write')
      or (
        split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
        and public.can_manage_stadium(split_part(name, '/', 1)::uuid)
      )
    )
  );

drop policy if exists stadiums_storage_admin_delete on storage.objects;
create policy stadiums_storage_admin_delete on storage.objects
  for delete
  using (
    bucket_id = 'stadiums'
    and (
      public.is_spojex_admin()
      or public.has_admin_permission('stadiums:write')
      or (
        split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
        and public.can_manage_stadium(split_part(name, '/', 1)::uuid)
      )
    )
  );

notify pgrst, 'reload schema';
