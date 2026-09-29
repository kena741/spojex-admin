-- National ID + professional evidence for identity verification.
-- Private storage; admin reviews and sets users.verified.
-- Safe to re-run.

insert into storage.buckets (id, name, public)
values ('identity-docs', 'identity-docs', false)
on conflict (id) do update set public = false;

create table if not exists public.identity_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  notes text not null default '',
  review_note text not null default '',
  reviewer_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists identity_verification_requests_user_idx
  on public.identity_verification_requests (user_id, created_at desc);

create index if not exists identity_verification_requests_status_idx
  on public.identity_verification_requests (status, created_at desc);

create unique index if not exists identity_verification_requests_one_pending
  on public.identity_verification_requests (user_id)
  where status = 'pending';

create table if not exists public.identity_verification_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.identity_verification_requests (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null
    check (kind in (
      'national_id_front',
      'national_id_back',
      'professional_license',
      'professional_certificate',
      'other'
    )),
  label text not null default '',
  storage_path text not null unique,
  mime_type text not null default 'image/jpeg',
  created_at timestamptz not null default now()
);

create index if not exists identity_verification_documents_request_idx
  on public.identity_verification_documents (request_id);

drop trigger if exists identity_verification_requests_updated_at
  on public.identity_verification_requests;
create trigger identity_verification_requests_updated_at
  before update on public.identity_verification_requests
  for each row execute function public.set_updated_at();

alter table public.identity_verification_requests enable row level security;
alter table public.identity_verification_documents enable row level security;

drop policy if exists identity_verification_requests_select
  on public.identity_verification_requests;
create policy identity_verification_requests_select
  on public.identity_verification_requests
  for select using (
    user_id = public.current_football_user_id()
    or public.has_admin_permission('users:read')
    or public.has_admin_permission('users:verify')
  );

drop policy if exists identity_verification_requests_insert
  on public.identity_verification_requests;
create policy identity_verification_requests_insert
  on public.identity_verification_requests
  for insert with check (
    user_id = public.current_football_user_id()
    and status = 'pending'
  );

drop policy if exists identity_verification_documents_select
  on public.identity_verification_documents;
create policy identity_verification_documents_select
  on public.identity_verification_documents
  for select using (
    user_id = public.current_football_user_id()
    or public.has_admin_permission('users:read')
    or public.has_admin_permission('users:verify')
  );

drop policy if exists identity_verification_documents_insert
  on public.identity_verification_documents;
create policy identity_verification_documents_insert
  on public.identity_verification_documents
  for insert with check (
    user_id = public.current_football_user_id()
    and exists (
      select 1
      from public.identity_verification_requests r
      where r.id = request_id
        and r.user_id = public.current_football_user_id()
        and r.status = 'pending'
    )
  );

drop policy if exists identity_verification_documents_delete
  on public.identity_verification_documents;
create policy identity_verification_documents_delete
  on public.identity_verification_documents
  for delete using (
    user_id = public.current_football_user_id()
    and exists (
      select 1
      from public.identity_verification_requests r
      where r.id = request_id
        and r.status = 'pending'
    )
  );

grant select, insert on public.identity_verification_requests to authenticated;
grant select, insert, delete on public.identity_verification_documents to authenticated;

drop policy if exists identity_docs_select on storage.objects;
create policy identity_docs_select on storage.objects
  for select using (
    bucket_id = 'identity-docs'
    and (
      split_part(name, '/', 1) = public.current_football_user_id()::text
      or public.has_admin_permission('users:read')
      or public.has_admin_permission('users:verify')
    )
  );

drop policy if exists identity_docs_insert on storage.objects;
create policy identity_docs_insert on storage.objects
  for insert with check (
    bucket_id = 'identity-docs'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists identity_docs_update on storage.objects;
create policy identity_docs_update on storage.objects
  for update using (
    bucket_id = 'identity-docs'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  )
  with check (
    bucket_id = 'identity-docs'
    and split_part(name, '/', 1) = public.current_football_user_id()::text
  );

drop policy if exists identity_docs_delete on storage.objects;
create policy identity_docs_delete on storage.objects
  for delete using (
    bucket_id = 'identity-docs'
    and (
      split_part(name, '/', 1) = public.current_football_user_id()::text
      or public.has_admin_permission('users:verify')
    )
  );

create or replace function public.review_identity_verification(
  p_request_id uuid,
  p_status text,
  p_note text default ''
)
returns public.identity_verification_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.identity_verification_requests;
begin
  if not public.has_admin_permission('users:verify') then
    raise exception 'not allowed';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid status';
  end if;

  update public.identity_verification_requests
  set
    status = p_status,
    review_note = coalesce(p_note, ''),
    reviewer_id = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_request_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'request not found';
  end if;

  update public.users
  set verified = (p_status = 'approved')
  where id = v_row.user_id;

  return v_row;
end;
$$;

grant execute on function public.review_identity_verification(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';
