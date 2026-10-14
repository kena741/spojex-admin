-- Opportunities admin writes: migration 107 only granted SELECT to authenticated
-- and ALL to service_role, with no insert/update/delete RLS policies.
-- Align with news/donations so staff JWT can manage rows (service_role still works).

grant select, insert, update, delete on public.opportunities to authenticated;
grant select, insert, update, delete on public.opportunity_applications to authenticated;
grant select, insert, update, delete on public.opportunity_application_payments to authenticated;
grant select, insert, update, delete on public.opportunity_waitlist to authenticated;

drop policy if exists opportunities_admin_write on public.opportunities;
create policy opportunities_admin_write on public.opportunities
  for all
  using (public.has_admin_permission('opportunities:write'))
  with check (public.has_admin_permission('opportunities:write'));

drop policy if exists opportunity_applications_admin_write
  on public.opportunity_applications;
create policy opportunity_applications_admin_write
  on public.opportunity_applications
  for all
  using (public.has_admin_permission('opportunities:write'))
  with check (public.has_admin_permission('opportunities:write'));

drop policy if exists opportunity_application_payments_admin_write
  on public.opportunity_application_payments;
create policy opportunity_application_payments_admin_write
  on public.opportunity_application_payments
  for all
  using (public.has_admin_permission('opportunities:write'))
  with check (public.has_admin_permission('opportunities:write'));

drop policy if exists opportunity_waitlist_admin_write on public.opportunity_waitlist;
create policy opportunity_waitlist_admin_write on public.opportunity_waitlist
  for all
  using (public.has_admin_permission('opportunities:write'))
  with check (public.has_admin_permission('opportunities:write'));
