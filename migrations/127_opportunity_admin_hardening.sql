-- Opportunities admin hardening:
-- 1) Unique waitlist membership (prevents duplicate interest entries from retries)
-- 2) Terms version on opportunities (bumped when terms/requirements change)
-- Soft / additive only - preserves existing IDs, applications, and payments.
-- Prefer Alembic a1spojex000058 on the API deploy path; this file is a mirror.

delete from public.opportunity_waitlist w
using public.opportunity_waitlist newer
where w.opportunity_id = newer.opportunity_id
  and w.user_id = newer.user_id
  and w.created_at > newer.created_at;

create unique index if not exists opportunity_waitlist_opp_user_uidx
  on public.opportunity_waitlist (opportunity_id, user_id);

alter table public.opportunities
  add column if not exists terms_version integer not null default 1;

comment on column public.opportunities.terms_version is
  'Incremented when additional_terms / eligibility / required docs change. Snapshotted onto applications at submit.';
