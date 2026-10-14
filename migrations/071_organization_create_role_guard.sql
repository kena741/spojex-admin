-- Fans, parents, and media roles cannot create organizations.
-- Athletes and football professionals still can. Safe to re-run.

alter table public.organizations enable row level security;

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations
  for insert with check (
    user_id in (
      select u.id
      from public.users u
      where u.user_id = auth.uid()
        and coalesce(u.role, '') not in (
          'fan',
          'parent_guardian',
          'photographer',
          'sports_journalist'
        )
    )
  );

notify pgrst, 'reload schema';
