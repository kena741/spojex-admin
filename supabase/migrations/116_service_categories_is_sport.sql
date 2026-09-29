-- service_categories.is_sport was defined in 058 but is missing on the live database.
-- Safe to re-run. Reloads the API schema cache.

alter table public.service_categories
  add column if not exists is_sport boolean not null default true;

update public.service_categories
set is_sport = false
where lower(coalesce(slug, '')) in ('legal', 'travel', 'education');

notify pgrst, 'reload schema';
