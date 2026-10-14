-- App-wide ranked search. pg_trgm (already in 001) + generated search_text
-- + RPC search_app / search_app_suggest.
-- Ranking: exact title > prefix > all tokens > partial > fuzzy > related.
-- Safe to re-run.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Normalize query / stored text
-- ---------------------------------------------------------------------------

create or replace function public.search_norm(p_input text)
returns text
language sql
immutable
as $$
  select trim(both from regexp_replace(
    lower(coalesce(p_input, '')),
    '[^[:alnum:]\s]+',
    ' ',
    'g'
  ));
$$;

create or replace function public.search_tokens(p_query text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_remove(regexp_split_to_array(public.search_norm(p_query), '\s+'), ''), '{}'::text[]);
$$;

create or replace function public.search_related_tokens(p_tokens text[])
returns text[]
language sql
immutable
as $$
  select coalesce((
    select array_agg(distinct extra)
    from unnest(coalesce(p_tokens, '{}'::text[])) as tok
    join lateral (
      select unnest(expansions) as extra
      from (
        values
          ('football', array['football','soccer','club','academy','team']),
          ('soccer', array['football','soccer','club']),
          ('footbal', array['football']),
          ('academy', array['academy','academies','youth','training']),
          ('academies', array['academy','youth']),
          ('acadmy', array['academy']),
          ('akademy', array['academy']),
          ('coach', array['coach','coaches','coaching','trainer']),
          ('coaches', array['coach','coaching']),
          ('coah', array['coach']),
          ('doctor', array['doctor','medical','medicine','physiotherapist','physician']),
          ('doctors', array['doctor','medical']),
          ('medical', array['medical','doctor','physiotherapist','medicine']),
          ('addis', array['addis','ababa','abeba']),
          ('abeba', array['ababa','addis']),
          ('ababa', array['addis','ababa']),
          ('ethi', array['ethiopia','ethiopian']),
          ('ethiopia', array['ethiopia','ethiopian','addis']),
          ('youth', array['youth','academy','u15','u17']),
          ('team', array['team','club','squad']),
          ('club', array['club','football','team','academy']),
          ('training', array['training','academy','coaching']),
          ('player', array['player','athlete','football']),
          ('stadium', array['stadium','pitch','facility','field']),
          ('radio', array['radio','fm','stream']),
          ('news', array['news','sport'])
      ) as syn(term, expansions)
      where syn.term = tok
         or tok like syn.term || '%'
         or (char_length(tok) >= 4 and syn.term like tok || '%')
    ) e on extra is not null and extra <> tok
  ), '{}'::text[]);
$$;

create or replace function public.search_rank(
  p_title text,
  p_body text,
  p_query text,
  p_tokens text[]
)
returns double precision
language plpgsql
immutable
as $$
declare
  title_n text := public.search_norm(p_title);
  body_n text := public.search_norm(p_body);
  query_n text := public.search_norm(p_query);
  score double precision := 0;
  tok text;
  hits int := 0;
  usable int := 0;
  sim double precision;
begin
  if query_n is null or query_n = '' then
    return 0;
  end if;

  if title_n = query_n then
    score := score + 100;
  elsif title_n like query_n || '%' then
    score := score + 72;
  elsif title_n like '%' || query_n || '%' then
    score := score + 50;
  else
    sim := word_similarity(query_n, title_n);
    if sim >= 0.45 then
      score := score + 38 * sim;
    elsif similarity(query_n, title_n) >= 0.22 then
      score := score + 24 * similarity(query_n, title_n);
    end if;
  end if;

  if body_n like '%' || query_n || '%' then
    score := score + 8;
  elsif word_similarity(query_n, body_n) >= 0.4 then
    score := score + 5;
  end if;

  foreach tok in array coalesce(p_tokens, '{}'::text[])
  loop
    if char_length(tok) < 2 then
      continue;
    end if;
    usable := usable + 1;
    if title_n like '%' || tok || '%' or body_n like '%' || tok || '%' then
      hits := hits + 1;
      score := score + case when title_n like '%' || tok || '%' then 14 else 8 end;
    elsif word_similarity(tok, title_n) >= 0.4
       or word_similarity(tok, body_n) >= 0.35 then
      hits := hits + 1;
      score := score + 10;
    elsif similarity(tok, title_n) >= 0.28 then
      hits := hits + 1;
      score := score + 6;
    end if;
  end loop;

  if usable > 1 and hits = usable then
    score := score + 28;
  elsif usable > 1 then
    score := score + hits * 4;
  end if;

  foreach tok in array public.search_related_tokens(p_tokens)
  loop
    if title_n like '%' || tok || '%' then
      score := score + 12;
      exit;
    elsif body_n like '%' || tok || '%' then
      score := score + 8;
      exit;
    end if;
  end loop;

  return score;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generated searchable text + trigram indexes
-- ---------------------------------------------------------------------------

alter table public.users drop column if exists search_text;
alter table public.users
  add column search_text text generated always as (
    public.search_norm(
      coalesce(display_name, '') || ' ' ||
      coalesce(full_name, '') || ' ' ||
      coalesce(headline, '') || ' ' ||
      coalesce(bio, '') || ' ' ||
      coalesce(role, '') || ' ' ||
      case coalesce(role, '')
        when 'player' then 'football soccer player athlete team'
        when 'coach' then 'football soccer coach coaching trainer'
        when 'fitness_coach' then 'football soccer coach fitness trainer'
        when 'scout' then 'football soccer scout talent'
        when 'agent' then 'football soccer agent'
        when 'referee' then 'football soccer referee'
        when 'analyst' then 'football soccer analyst'
        when 'physiotherapist' then 'doctor medical physiotherapist physio'
        when 'nutritionist' then 'nutrition diet medical'
        when 'medical' then 'doctor medical medicine physician physiotherapist'
        when 'consultant' then 'consultant advisor football'
        else ''
      end || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(country, '')
    )
  ) stored;

alter table public.organizations drop column if exists search_text;
alter table public.organizations
  add column search_text text generated always as (
    public.search_norm(
      coalesce(name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(organization_type, '') || ' ' ||
      case
        when lower(coalesce(organization_type, '')) like '%academy%' then 'football academy youth training soccer'
        when lower(coalesce(organization_type, '')) like '%club%' then 'football club team soccer'
        when lower(coalesce(organization_type, '')) like '%team%' then 'football team club soccer squad'
        else coalesce(organization_type, '')
      end || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(country, '')
    )
  ) stored;

alter table public.services drop column if exists search_text;
alter table public.services
  add column search_text text generated always as (
    public.search_norm(
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(country, '') || ' ' ||
      coalesce(service_area, '') || ' ' ||
      coalesce(category_id::text, '')
    )
  ) stored;

alter table public.stadiums drop column if exists search_text;
alter table public.stadiums
  add column search_text text generated always as (
    public.search_norm(
      coalesce(name, '') || ' ' ||
      coalesce(location, '') || ' ' ||
      coalesce(address, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(array_to_string(facilities, ' '), '') || ' ' ||
      coalesce(size_type, '')
    )
  ) stored;

alter table public.events drop column if exists search_text;
alter table public.events
  add column search_text text generated always as (
    public.search_norm(
      coalesce(name, '') || ' ' ||
      coalesce(venue_name, '') || ' ' ||
      coalesce(location, '') || ' ' ||
      coalesce(address, '') || ' ' ||
      coalesce(description, '')
    )
  ) stored;

alter table public.donation_campaigns drop column if exists search_text;
alter table public.donation_campaigns
  add column search_text text generated always as (
    public.search_norm(
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(description, '')
    )
  ) stored;

alter table public.radio_streams drop column if exists search_text;
alter table public.radio_streams
  add column search_text text generated always as (
    public.search_norm(
      coalesce(name, '') || ' ' ||
      coalesce(tagline, '') || ' ' ||
      coalesce(genre, '') || ' ' ||
      coalesce(city, '')
    )
  ) stored;

alter table public.sport_news drop column if exists search_text;
alter table public.sport_news
  add column search_text text generated always as (
    public.search_norm(
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(source, '') || ' ' ||
      coalesce(author, '')
    )
  ) stored;

create index if not exists users_search_trgm_idx
  on public.users using gin (search_text gin_trgm_ops);
create index if not exists organizations_search_trgm_idx
  on public.organizations using gin (search_text gin_trgm_ops);
create index if not exists services_search_trgm_idx
  on public.services using gin (search_text gin_trgm_ops);
create index if not exists stadiums_search_trgm_idx
  on public.stadiums using gin (search_text gin_trgm_ops);
create index if not exists events_search_trgm_idx
  on public.events using gin (search_text gin_trgm_ops);
create index if not exists donation_campaigns_search_trgm_idx
  on public.donation_campaigns using gin (search_text gin_trgm_ops);
create index if not exists radio_streams_search_trgm_idx
  on public.radio_streams using gin (search_text gin_trgm_ops);
create index if not exists sport_news_search_trgm_idx
  on public.sport_news using gin (search_text gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- search_app: ranked hits across public content
-- ---------------------------------------------------------------------------

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
        coalesce(nullif(u.display_name, ''), nullif(u.full_name, ''), 'Member') as title,
        trim(both ' · ' from concat_ws(' · ', coalesce(r.label, u.role), nullif(u.city, ''))) as subtitle,
        coalesce(u.avatar_url, '') as image_url,
        u.city,
        u.country,
        public.search_rank(
          u.display_name || ' ' || u.full_name,
          u.headline || ' ' || u.bio || ' ' || u.city || ' ' || coalesce(r.label, u.role, ''),
          q,
          tokens
        )
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

create or replace function public.search_app_suggest(
  p_query text,
  p_country text default null,
  p_limit integer default 12
)
returns table (
  label text,
  kind text,
  id uuid,
  subtitle text,
  image_url text,
  score double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := public.search_norm(p_query);
  cap int := greatest(4, least(coalesce(p_limit, 12), 20));
begin
  if q is null or char_length(q) < 2 then
    return;
  end if;

  return query
  select s.title, s.kind, s.id, s.subtitle, s.image_url, s.score
  from public.search_app(p_query, 'all', p_country, cap) s
  order by
    (public.search_norm(s.title) = q)::int desc,
    (public.search_norm(s.title) like q || '%')::int desc,
    s.score desc
  limit cap;
end;
$$;

grant execute on function public.search_norm(text) to anon, authenticated, service_role;
grant execute on function public.search_tokens(text) to anon, authenticated, service_role;
grant execute on function public.search_related_tokens(text[]) to anon, authenticated, service_role;
grant execute on function public.search_rank(text, text, text, text[]) to anon, authenticated, service_role;
grant execute on function public.search_app(text, text, text, integer) to anon, authenticated, service_role;
grant execute on function public.search_app_suggest(text, text, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
