-- Persist service reviews and keep listing ratings in sync.
-- The old refresh_service_reputation() updated users.rating_avg, which 010 dropped,
-- so inserts into service_reviews rolled back. Safe to re-run.

create or replace function public.refresh_service_reputation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service uuid := coalesce(new.service_id, old.service_id);
begin
  if v_service is null then
    return coalesce(new, old);
  end if;

  update public.services
  set
    rating_avg = coalesce((
      select avg(r.rating)::numeric(3, 2)
      from public.service_reviews r
      where r.service_id = v_service
    ), 0),
    review_count = (
      select count(*)
      from public.service_reviews r
      where r.service_id = v_service
    )
  where id = v_service;

  return coalesce(new, old);
end;
$$;

drop trigger if exists service_reviews_reputation on public.service_reviews;
create trigger service_reviews_reputation
  after insert or update or delete on public.service_reviews
  for each row execute function public.refresh_service_reputation();

drop policy if exists service_reviews_write on public.service_reviews;
create policy service_reviews_write on public.service_reviews
  for insert with check (
    public.is_current_football_user(reviewer_id)
    and request_id is not null
    and exists (
      select 1
      from public.service_requests q
      where q.id = request_id
        and q.service_id = service_reviews.service_id
        and q.provider_id = service_reviews.provider_id
        and q.requester_id = service_reviews.reviewer_id
        and q.status = 'completed'
    )
  );

grant select, insert on table public.service_reviews to authenticated;

notify pgrst, 'reload schema';
