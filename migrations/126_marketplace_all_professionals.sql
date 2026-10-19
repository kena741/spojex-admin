-- Allow every professional + media identity (not just coach/scout/agent)
-- to create marketplace service listings. Matches IdentityCatalog.canOfferServices.
-- Safe to re-run.

create or replace function public.can_offer_marketplace_services()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    left join public.identity_roles r
      on r.slug = u.role
      or r.slug = case u.role
        when 'medical_professional' then 'medical'
        when 'other' then 'other_professional'
        when 'journalist' then 'sports_journalist'
        when 'media' then 'sports_journalist'
        else u.role
      end
    left join public.identity_role_groups g on g.id = r.group_id
    where public.is_current_football_user(u.id)
      and (
        coalesce(g.slug, '') in ('professional', 'media')
        or u.role in (
          'coach',
          'scout',
          'agent',
          'referee',
          'analyst',
          'fitness_coach',
          'trainer',
          'physiotherapist',
          'nutritionist',
          'consultant',
          'administrator',
          'medical',
          'medical_professional',
          'other_professional',
          'other',
          'photographer',
          'sports_journalist',
          'journalist',
          'media'
        )
      )
  );
$$;

grant execute on function public.can_offer_marketplace_services() to authenticated;

notify pgrst, 'reload schema';
