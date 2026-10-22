-- Role-based identity verification document catalog.
-- Document types + per-role requirements drive mobile upload steps and admin review.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Catalog: document types
-- ---------------------------------------------------------------------------
create table if not exists public.identity_document_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  description text not null default '',
  step text not null default 'role_evidence'
    check (step in ('identity', 'role_evidence')),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists identity_document_types_active_idx
  on public.identity_document_types (is_active, step, sort_order);

drop trigger if exists identity_document_types_updated_at
  on public.identity_document_types;
create trigger identity_document_types_updated_at
  before update on public.identity_document_types
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Mapping: identity role slug → document type
-- ---------------------------------------------------------------------------
create table if not exists public.identity_role_document_requirements (
  id uuid primary key default gen_random_uuid(),
  role_slug text not null,
  document_type_id uuid not null
    references public.identity_document_types (id) on delete cascade,
  is_required boolean not null default true,
  description text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_slug, document_type_id)
);

create index if not exists identity_role_document_requirements_role_idx
  on public.identity_role_document_requirements (role_slug, sort_order);

drop trigger if exists identity_role_document_requirements_updated_at
  on public.identity_role_document_requirements;
create trigger identity_role_document_requirements_updated_at
  before update on public.identity_role_document_requirements
  for each row execute function public.set_updated_at();

-- Allow catalog-driven kinds (admin can add document types without a migration).
alter table public.identity_verification_documents
  drop constraint if exists identity_verification_documents_kind_check;

alter table public.identity_verification_documents
  add constraint identity_verification_documents_kind_check
  check (char_length(trim(kind)) > 0);

-- ---------------------------------------------------------------------------
-- Seed document types
-- ---------------------------------------------------------------------------
insert into public.identity_document_types (slug, label, description, step, is_active, sort_order)
values
  ('national_id_front', 'National ID (front)', 'Front side of National ID / Fayda.', 'identity', true, 10),
  ('national_id_back', 'National ID (back)', 'Back side of National ID / Fayda.', 'identity', true, 20),
  ('professional_license', 'Professional license', 'Coaching, medical, scouting, or other professional license.', 'role_evidence', true, 30),
  ('professional_certificate', 'Certificate', 'Training certificate or accreditation.', 'role_evidence', true, 40),
  ('press_credential', 'Press / media credential', 'Press card or media accreditation.', 'role_evidence', true, 50),
  ('media_portfolio', 'Media portfolio sample', 'Sample of published or match-day work.', 'role_evidence', true, 60),
  ('federation_card', 'Federation / association card', 'Federation, association, or referee ID card.', 'role_evidence', true, 70),
  ('club_letter', 'Club affiliation letter', 'Letter from club, academy, or school confirming affiliation.', 'role_evidence', true, 80),
  ('other', 'Other supporting document', 'Any additional supporting photo or PDF.', 'role_evidence', true, 90)
on conflict (slug) do update set
  label = excluded.label,
  description = excluded.description,
  step = excluded.step,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Seed role → document requirements
-- ---------------------------------------------------------------------------
create or replace function public._seed_identity_role_doc(
  p_role text,
  p_slug text,
  p_required boolean,
  p_description text,
  p_sort int
)
returns void
language plpgsql
as $$
declare
  v_type_id uuid;
begin
  select id into v_type_id
  from public.identity_document_types
  where slug = p_slug;
  if v_type_id is null then
    return;
  end if;
  insert into public.identity_role_document_requirements (
    role_slug, document_type_id, is_required, description, sort_order
  )
  values (p_role, v_type_id, p_required, coalesce(p_description, ''), p_sort)
  on conflict (role_slug, document_type_id) do update set
    is_required = excluded.is_required,
    description = excluded.description,
    sort_order = excluded.sort_order,
    updated_at = now();
end;
$$;

do $$
declare
  r text;
  identity_roles text[] := array[
    'player',
    'coach', 'scout', 'agent', 'referee', 'analyst', 'fitness_coach',
    'physiotherapist', 'nutritionist', 'consultant', 'administrator',
    'medical', 'other_professional',
    'photographer', 'sports_journalist'
  ];
begin
  -- Step 1: identity (National ID) for every verifiable role
  foreach r in array identity_roles loop
    perform public._seed_identity_role_doc(r, 'national_id_front', true, 'Clear photo of the front of your National ID.', 10);
    perform public._seed_identity_role_doc(r, 'national_id_back', true, 'Clear photo of the back of your National ID.', 20);
  end loop;

  -- Athlete
  perform public._seed_identity_role_doc('player', 'federation_card', false, 'Optional federation or association player card.', 30);
  perform public._seed_identity_role_doc('player', 'club_letter', false, 'Optional club or academy affiliation letter.', 40);

  -- Professionals with license-heavy roles
  foreach r in array array['coach', 'fitness_coach', 'scout', 'agent'] loop
    perform public._seed_identity_role_doc(r, 'professional_license', true, 'Upload your professional license or accreditation.', 30);
    perform public._seed_identity_role_doc(r, 'professional_certificate', false, 'Optional certificate or supporting credential.', 40);
  end loop;

  perform public._seed_identity_role_doc('referee', 'federation_card', true, 'Referee federation / association card.', 30);
  perform public._seed_identity_role_doc('referee', 'professional_license', false, 'Optional officiating license.', 40);

  foreach r in array array['physiotherapist', 'medical', 'nutritionist'] loop
    perform public._seed_identity_role_doc(r, 'professional_license', true, 'Professional or clinical license.', 30);
    perform public._seed_identity_role_doc(r, 'professional_certificate', false, 'Optional certificate.', 40);
  end loop;

  foreach r in array array['analyst', 'consultant', 'administrator', 'other_professional'] loop
    perform public._seed_identity_role_doc(r, 'professional_license', false, 'Optional professional license.', 30);
    perform public._seed_identity_role_doc(r, 'professional_certificate', false, 'Optional certificate.', 40);
    perform public._seed_identity_role_doc(r, 'other', false, 'Optional supporting document.', 50);
  end loop;

  -- Media
  foreach r in array array['photographer', 'sports_journalist'] loop
    perform public._seed_identity_role_doc(r, 'press_credential', true, 'Press card or media accreditation.', 30);
    perform public._seed_identity_role_doc(r, 'media_portfolio', false, 'Optional sample of your work.', 40);
    perform public._seed_identity_role_doc(r, 'other', false, 'Optional supporting document.', 50);
  end loop;
end;
$$;

drop function if exists public._seed_identity_role_doc(text, text, boolean, text, int);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.identity_document_types enable row level security;
alter table public.identity_role_document_requirements enable row level security;

drop policy if exists identity_document_types_select on public.identity_document_types;
create policy identity_document_types_select
  on public.identity_document_types
  for select using (
    is_active = true
    or public.has_admin_permission('profiles:read')
    or public.has_admin_permission('users:verify')
    or public.has_admin_permission('users:read')
  );

drop policy if exists identity_document_types_write on public.identity_document_types;
create policy identity_document_types_write
  on public.identity_document_types
  for all using (
    public.has_admin_permission('profiles:write')
  )
  with check (
    public.has_admin_permission('profiles:write')
  );

drop policy if exists identity_role_document_requirements_select
  on public.identity_role_document_requirements;
create policy identity_role_document_requirements_select
  on public.identity_role_document_requirements
  for select using (true);

drop policy if exists identity_role_document_requirements_write
  on public.identity_role_document_requirements;
create policy identity_role_document_requirements_write
  on public.identity_role_document_requirements
  for all using (
    public.has_admin_permission('profiles:write')
  )
  with check (
    public.has_admin_permission('profiles:write')
  );

grant select on public.identity_document_types to authenticated, anon;
grant select on public.identity_role_document_requirements to authenticated, anon;
grant select, insert, update, delete on public.identity_document_types to authenticated;
grant select, insert, update, delete on public.identity_role_document_requirements to authenticated;

-- ---------------------------------------------------------------------------
-- Helper: requirements for a role (mobile + admin)
-- ---------------------------------------------------------------------------
create or replace function public.identity_verification_requirements(p_role_slug text)
returns table (
  document_type_id uuid,
  slug text,
  label text,
  description text,
  step text,
  is_required boolean,
  requirement_description text,
  sort_order int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id as document_type_id,
    t.slug,
    t.label,
    t.description,
    t.step,
    r.is_required,
    case
      when coalesce(nullif(trim(r.description), ''), '') <> '' then r.description
      else t.description
    end as requirement_description,
    coalesce(r.sort_order, t.sort_order) as sort_order
  from public.identity_role_document_requirements r
  join public.identity_document_types t on t.id = r.document_type_id
  where r.role_slug = p_role_slug
    and t.is_active = true
  order by
    case t.step when 'identity' then 0 else 1 end,
    coalesce(r.sort_order, t.sort_order),
    t.label;
$$;

grant execute on function public.identity_verification_requirements(text)
  to authenticated, anon;

notify pgrst, 'reload schema';
