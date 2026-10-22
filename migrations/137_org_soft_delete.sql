-- Organization soft delete (trash). Linked products/content stay attached.
-- Mirrors backend a1spojex000070.

alter table public.organizations
  add column if not exists deleted_at timestamptz;
alter table public.organizations
  add column if not exists deleted_by uuid references public.users (id) on delete set null;
alter table public.organizations
  add column if not exists delete_snapshot jsonb;

create index if not exists organizations_deleted_at_idx
  on public.organizations (deleted_at)
  where deleted_at is not null;

comment on column public.organizations.deleted_at is
  'Soft-delete (trash). Linked content is preserved; exclude from public listings.';
comment on column public.organizations.deleted_by is
  'Admin users.id who moved the organization to trash.';
comment on column public.organizations.delete_snapshot is
  'Publication state at soft-delete time (verified, archived_at) for restore.';

create or replace function public.organization_is_publicly_listable(org_id uuid)
returns boolean
language sql
stable
parallel safe
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = org_id
      and o.deleted_at is null
      and o.archived_at is null
  );
$$;

-- Patch search_app: exclude trashed/archived organizations
create or replace function public.search_app(
  p_query text,
  p_kind text default 'all',
  p_country text default null,
  p_limit integer default 20
)
returns table (
  kind text,
  id uuid,
  title text,
  subtitle text,
  image_url text,
  city text,
  country text,
  score double precision,
  payload jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := public.search_norm(p_query);
  tokens text[] := public.search_tokens(p_query);
  related text[] := public.search_related_tokens(public.search_tokens(p_query));
  kind_filter text := lower(coalesce(nullif(trim(p_kind), ''), 'all'));
  cap int := greatest(3, least(coalesce(p_limit, 20), 40));
  place text := public.search_norm(p_country);
begin
  perform set_config('pg_trgm.word_similarity_threshold', '0.35', true);
  perform set_config('pg_trgm.similarity_threshold', '0.2', true);

  if q is null or q = '' then
    return;
  end if;

  return query
  with candidates as (
    select *
    from (
      select
        'person'::text as kind,
        u.id,
        coalesce(nullif(u.display_name, ''), nullif(u.full_name, ''), nullif(u.username, ''), 'Member') as title,
        trim(both ' · ' from concat_ws(' · ',
          case when coalesce(u.username, '') <> '' then '@' || u.username else null end,
          coalesce(r.label, u.role),
          nullif(u.city, '')
        )) as subtitle,
        coalesce(u.avatar_url, '') as image_url,
        u.city,
        u.country,
        public.search_rank(
          coalesce(u.username, '') || ' ' || coalesce(u.display_name, '') || ' ' || coalesce(u.full_name, ''),
          u.headline || ' ' || u.bio || ' ' || u.city || ' ' || coalesce(r.label, u.role, ''),
          q,
          tokens
        )
        + case
            when public.search_norm(coalesce(u.username, '')) = q then 110
            when public.search_norm(coalesce(u.username, '')) like q || '%' then 90
            when public.search_norm(coalesce(u.username, '')) like '%' || q || '%' then 70
            when lower(coalesce(u.username, '')) = lower(trim(p_query)) then 110
            when lower(coalesce(u.username, '')) like lower(trim(p_query)) || '%' then 90
            else 0
          end
        + case
            when exists (
              select 1 from unnest(related) rel
              where rel = any (array['coach','player','scout','medical','doctor'])
                and (
                  u.role ilike '%' || rel || '%'
                  or coalesce(r.label, '') ilike '%' || rel || '%'
                )
            ) then 16
            when exists (
              select 1 from unnest(related) rel
              where rel = any (array['football','soccer'])
                and u.role = any (array[
                  'player','coach','scout','agent','referee','fitness_coach',
                  'analyst','physiotherapist','medical'
                ])
            ) then 14
            else 0
          end
        + case
            when place <> '' and (
              public.search_norm(u.country) = place
              or public.search_norm(u.city) like '%' || place || '%'
            ) then 6
            when place <> '' then -8
            else 0
          end as score,
        jsonb_build_object(
          'id', u.id,
          'user_id', u.user_id,
          'display_name', u.display_name,
          'username', u.username,
          'full_name', u.full_name,
          'headline', u.headline,
          'bio', u.bio,
          'country', u.country,
          'city', u.city,
          'role', u.role,
          'avatar_url', u.avatar_url,
          'verified', u.verified
        ) as payload
      from public.users u
      left join public.identity_roles r on r.slug = u.role
      where coalesce(trim(u.role), '') <> ''
        and (
          u.search_text like '%' || q || '%'
          or u.search_text % q
          or public.search_norm(coalesce(u.username, '')) like '%' || q || '%'
          or lower(coalesce(u.username, '')) like '%' || lower(trim(p_query)) || '%'
          or exists (
            select 1 from unnest(tokens) t
            where char_length(t) >= 2 and u.search_text like '%' || t || '%'
          )
          or exists (
            select 1 from unnest(related) t
            where char_length(t) >= 3 and u.search_text like '%' || t || '%'
          )
        )

      union all

      select
        'organization',
        o.id,
        o.name,
        trim(both ' · ' from concat_ws(' · ', o.organization_type, nullif(o.city, ''))),
        coalesce(o.logo_url, ''),
        o.city,
        o.country,
        public.search_rank(
          o.name,
          o.description || ' ' || o.organization_type || ' ' || o.city || ' ' || o.country,
          q,
          tokens
        )
        + case
            when exists (
              select 1 from unnest(related) rel
              where rel = any (array['club','academy','team','football'])
                and o.organization_type ilike '%' || rel || '%'
            ) then 18
            else 0
          end
        + case
            when place <> '' and (
              public.search_norm(o.country) = place
              or public.search_norm(o.city) like '%' || place || '%'
            ) then 6
            when place <> '' then -8
            else 0
          end,
        jsonb_build_object(
          'id', o.id,
          'user_id', o.user_id,
          'public_id', o.public_id,
          'organization_type', o.organization_type,
          'name', o.name,
          'country', o.country,
          'city', o.city,
          'currency', o.currency,
          'description', o.description,
          'verified', o.verified,
          'logo_url', o.logo_url
        )
      from public.organizations o
      where
        o.deleted_at is null
        and coalesce(o.archived_at is null, true)
        and (
        o.search_text like '%' || q || '%'
        or o.search_text % q
        or exists (
          select 1 from unnest(tokens) t
          where char_length(t) >= 2 and o.search_text like '%' || t || '%'
        )
        or exists (
          select 1 from unnest(related) t
          where char_length(t) >= 3 and (
            o.search_text like '%' || t || '%'
            or o.organization_type ilike '%' || t || '%'
          )
        )
        )

      union all

      select
        'service',
        s.id,
        s.title,
        trim(both ' · ' from concat_ws(' · ', coalesce(c.label, s.category_id::text), nullif(s.city, ''))),
        coalesce(s.cover_url, ''),
        s.city,
        s.country,
        public.search_rank(
          s.title,
          s.description || ' ' || coalesce(c.label, '') || ' ' || s.city || ' ' || s.service_area,
          q,
          tokens
        )
        + case
            when exists (
              select 1 from unnest(related) rel
              where (
                coalesce(c.label, '') ilike '%' || rel || '%'
                or s.category_id::text ilike '%' || rel || '%'
                or (rel in ('doctor','medical') and (
                  s.category_id::text ilike '%medical%'
                  or coalesce(c.label, '') ilike '%medicine%'
                ))
                or (rel in ('coach','coaching','football') and (
                  s.category_id::text ilike '%coach%'
                  or coalesce(c.label, '') ilike '%coach%'
                ))
              )
            ) then 16
            else 0
          end
        + case
            when place <> '' and (
              public.search_norm(s.country) = place
              or public.search_norm(s.city) like '%' || place || '%'
              or coalesce(s.country, '') = ''
            ) then 6
            when place <> '' then -8
            else 0
          end,
        to_jsonb(s) || jsonb_build_object(
          'users', jsonb_build_object(
            'display_name', u.display_name,
            'avatar_url', u.avatar_url,
            'role', u.role,
            'verified', u.verified,
            'currency', u.currency
          )
        )
      from public.services s
      left join public.service_categories c on c.id::text = s.category_id::text
      left join public.users u on u.id = s.provider_id
      where s.published = true
        and (
          s.search_text like '%' || q || '%'
          or s.search_text % q
          or exists (
            select 1 from unnest(tokens) t
            where char_length(t) >= 2 and s.search_text like '%' || t || '%'
          )
          or exists (
            select 1 from unnest(related) t
            where char_length(t) >= 3 and (
              s.search_text like '%' || t || '%'
              or coalesce(c.label, '') ilike '%' || t || '%'
            )
          )
        )

      union all

      select
        'stadium',
        st.id,
        st.name,
        nullif(st.location, ''),
        coalesce(st.image_url, ''),
        st.location,
        '',
        public.search_rank(
          st.name,
          st.location || ' ' || st.address || ' ' || st.description,
          q,
          tokens
        )
        + case
            when exists (
              select 1 from unnest(related) rel
              where rel = any (array['stadium','pitch','football','facility'])
            ) then 10
            else 0
          end
        + case
            when place <> '' and (
              public.search_norm(st.location) like '%' || place || '%'
              or public.search_norm(st.address) like '%' || place || '%'
              or public.search_norm(st.name) like '%' || place || '%'
            ) then 6
            when place <> '' then -6
            else 0
          end,
        to_jsonb(st)
      from public.stadiums st
      where st.status = 'active'
        and (
          st.search_text like '%' || q || '%'
          or st.search_text % q
          or exists (
            select 1 from unnest(tokens) t
            where char_length(t) >= 2 and st.search_text like '%' || t || '%'
          )
          or exists (
            select 1 from unnest(related) t
            where char_length(t) >= 3 and st.search_text like '%' || t || '%'
          )
        )

      union all

      select
        'event',
        e.id,
        e.name,
        coalesce(nullif(e.venue_name, ''), nullif(e.location, '')),
        coalesce(e.image_url, ''),
        e.location,
        '',
        public.search_rank(
          e.name,
          e.venue_name || ' ' || e.location || ' ' || e.address || ' ' || e.description,
          q,
          tokens
        )
        + case
            when exists (
              select 1 from unnest(related) rel
              where rel = any (array['football','academy','youth','team'])
                and e.search_text like '%' || rel || '%'
            ) then 12
            else 0
          end
        + case
            when place <> '' and (
              public.search_norm(e.location) like '%' || place || '%'
              or public.search_norm(e.address) like '%' || place || '%'
              or public.search_norm(e.venue_name) like '%' || place || '%'
            ) then 6
            when place <> '' then -6
            else 0
          end,
        to_jsonb(e)
      from public.events e
      where e.status = 'active'
        and (
          e.search_text like '%' || q || '%'
          or e.search_text % q
          or exists (
            select 1 from unnest(tokens) t
            where char_length(t) >= 2 and e.search_text like '%' || t || '%'
          )
          or exists (
            select 1 from unnest(related) t
            where char_length(t) >= 3 and e.search_text like '%' || t || '%'
          )
        )

      union all

      select
        'donation',
        d.id,
        d.title,
        nullif(d.summary, ''),
        coalesce(d.image_url, d.cover_url, ''),
        '',
        '',
        public.search_rank(d.title, d.summary || ' ' || d.description, q, tokens),
        to_jsonb(d)
      from public.donation_campaigns d
      where d.status = 'active'
        and (
          d.search_text like '%' || q || '%'
          or d.search_text % q
          or exists (
            select 1 from unnest(tokens) t
            where char_length(t) >= 2 and d.search_text like '%' || t || '%'
          )
          or exists (
            select 1 from unnest(related) t
            where char_length(t) >= 3 and d.search_text like '%' || t || '%'
          )
        )

      union all

      select
        'radio',
        rs.id,
        rs.name,
        trim(both ' · ' from concat_ws(' · ', nullif(rs.genre, ''), nullif(rs.city, ''))),
        coalesce(rs.image_url, ''),
        rs.city,
        '',
        public.search_rank(rs.name, rs.tagline || ' ' || rs.genre || ' ' || rs.city, q, tokens)
        + case
            when place <> '' and public.search_norm(rs.city) like '%' || place || '%' then 6
            when place <> '' then -4
            else 0
          end,
        to_jsonb(rs)
      from public.radio_streams rs
      where rs.status = 'active'
        and (
          rs.search_text like '%' || q || '%'
          or rs.search_text % q
          or exists (
            select 1 from unnest(tokens) t
            where char_length(t) >= 2 and rs.search_text like '%' || t || '%'
          )
          or exists (
            select 1 from unnest(related) t
            where char_length(t) >= 3 and rs.search_text like '%' || t || '%'
          )
        )

      union all

      select
        'news',
        n.id,
        n.title,
        coalesce(nullif(n.source, ''), n.category),
        coalesce(n.image_url, n.cover_url, ''),
        '',
        '',
        public.search_rank(n.title, n.summary || ' ' || n.category || ' ' || n.source, q, tokens),
        to_jsonb(n)
      from public.sport_news n
      where n.status = 'active'
        and (
          n.search_text like '%' || q || '%'
          or n.search_text % q
          or exists (
            select 1 from unnest(tokens) t
            where char_length(t) >= 2 and n.search_text like '%' || t || '%'
          )
          or exists (
            select 1 from unnest(related) t
            where char_length(t) >= 3 and n.search_text like '%' || t || '%'
          )
        )
    ) raw
    where kind_filter = 'all' or raw.kind = kind_filter
  ),
  strong as (
    select *
    from (
      select
        c.*,
        row_number() over (
          partition by c.kind
          order by c.score desc, c.title
        ) as rn
      from candidates c
      where c.score >= 6
    ) s
    where s.rn <= cap
  ),
  weak as (
    select *
    from (
      select
        c.*,
        row_number() over (
          partition by c.kind
          order by c.score desc, c.title
        ) as rn
      from candidates c
      where c.score >= 2
    ) w
    where w.rn <= cap
  )
  select
    x.kind,
    x.id,
    x.title,
    x.subtitle,
    x.image_url,
    x.city,
    x.country,
    x.score,
    x.payload
  from (
    select kind, id, title, subtitle, image_url, city, country, score, payload
    from strong
    union all
    select kind, id, title, subtitle, image_url, city, country, score, payload
    from weak
    where not exists (select 1 from strong)
  ) x
  order by x.score desc, x.title;
end;
$$;
