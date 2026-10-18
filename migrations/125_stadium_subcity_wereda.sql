-- Structured Addis Ababa location for stadiums (sub-city + woreda).
alter table public.stadiums
  add column if not exists subcity text not null default '';

alter table public.stadiums
  add column if not exists wereda integer;

comment on column public.stadiums.subcity is
  'Addis Ababa sub-city (e.g. Bole, Yeka, Lemi Kura).';
comment on column public.stadiums.wereda is
  'Woreda number within the sub-city (1-based).';

create index if not exists stadiums_subcity_idx
  on public.stadiums (subcity)
  where subcity <> '';

create index if not exists stadiums_subcity_wereda_idx
  on public.stadiums (subcity, wereda)
  where subcity <> '';

-- Soft backfill from free-text location/address when still empty.
update public.stadiums
   set subcity = 'Addis Ketema'
 where coalesce(subcity, '') = ''
   and (location ilike '%addis ketema%' or address ilike '%addis ketema%');

update public.stadiums
   set subcity = 'Akaki Kality'
 where coalesce(subcity, '') = ''
   and (
     location ilike '%akaki%'
     or address ilike '%akaki%'
     or location ilike '%kaliti%'
     or address ilike '%kaliti%'
     or location ilike '%kality%'
     or address ilike '%kality%'
   );

update public.stadiums
   set subcity = 'Arada'
 where coalesce(subcity, '') = ''
   and (location ilike '%arada%' or address ilike '%arada%');

update public.stadiums
   set subcity = 'Bole'
 where coalesce(subcity, '') = ''
   and (location ilike '%bole%' or address ilike '%bole%')
   and location not ilike '%bole arabsa%';

update public.stadiums
   set subcity = 'Gulele'
 where coalesce(subcity, '') = ''
   and (
     location ilike '%gulele%'
     or address ilike '%gulele%'
     or location ilike '%gullele%'
     or address ilike '%gullele%'
   );

update public.stadiums
   set subcity = 'Kirkos'
 where coalesce(subcity, '') = ''
   and (
     location ilike '%kirkos%'
     or address ilike '%kirkos%'
     or location ilike '%kerkos%'
     or address ilike '%kerkos%'
   );

update public.stadiums
   set subcity = 'Kolfe Keranio'
 where coalesce(subcity, '') = ''
   and (location ilike '%kolfe%' or address ilike '%kolfe%');

update public.stadiums
   set subcity = 'Lideta'
 where coalesce(subcity, '') = ''
   and (
     location ilike '%lideta%'
     or address ilike '%lideta%'
     or location ilike '%ledeta%'
     or address ilike '%ledeta%'
   );

update public.stadiums
   set subcity = 'Nifas Silk-Lafto'
 where coalesce(subcity, '') = ''
   and (
     location ilike '%nifas%'
     or address ilike '%nifas%'
     or location ilike '%nefas%'
     or address ilike '%nefas%'
     or location ilike '%lafto%'
     or address ilike '%lafto%'
   );

update public.stadiums
   set subcity = 'Lemi Kura'
 where coalesce(subcity, '') = ''
   and (
     location ilike '%lemi kura%'
     or address ilike '%lemi kura%'
     or location ilike '%ayat%'
     or address ilike '%ayat%'
     or location ilike '%cmc%'
     or address ilike '%cmc%'
     or location ilike '%summit%'
     or address ilike '%summit%'
     or location ilike '%arabsa%'
     or address ilike '%arabsa%'
   );

update public.stadiums
   set subcity = 'Yeka'
 where coalesce(subcity, '') = ''
   and (location ilike '%yeka%' or address ilike '%yeka%');
