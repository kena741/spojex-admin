-- Unique stadium subscription pass codes + sequential numbers for QR check-in.
-- Run after 041_event_ticket_number.sql. Safe to re-run.

alter table public.stadium_subscriptions
  add column if not exists pass_code text;

alter table public.stadium_subscriptions
  add column if not exists pass_number int;

alter table public.stadium_subscriptions
  add column if not exists checked_in_at timestamptz;

alter table public.stadium_subscriptions
  add column if not exists checked_out_at timestamptz;

create or replace function public.generate_stadium_pass_code()
returns text
language plpgsql
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.stadium_subscriptions where pass_code = code
    );
  end loop;
  return code;
end;
$$;

update public.stadium_subscriptions
set pass_code = public.generate_stadium_pass_code()
where pass_code is null or btrim(pass_code) = '';

update public.stadium_subscriptions t
set pass_number = numbered.n
from (
  select
    id,
    row_number() over (partition by stadium_id order by created_at, id) as n
  from public.stadium_subscriptions
  where pass_number is null
) numbered
where t.id = numbered.id
  and t.pass_number is null;

create unique index if not exists stadium_subscriptions_pass_code_uniq
  on public.stadium_subscriptions (pass_code)
  where pass_code is not null and btrim(pass_code) <> '';

create unique index if not exists stadium_subscriptions_stadium_number_uniq
  on public.stadium_subscriptions (stadium_id, pass_number)
  where pass_number is not null;

grant execute on function public.generate_stadium_pass_code() to authenticated;

notify pgrst, 'reload schema';
