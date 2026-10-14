-- Stadium pricing lives on stadiums.pricing (session / monthly / yearly).
-- Drops public.stadium_plans. Safe to re-run.

alter table public.stadiums
  add column if not exists pricing jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'stadium_plans'
  ) then
    update public.stadiums s
    set pricing = coalesce(
      (
        select jsonb_strip_nulls(
          jsonb_build_object(
            'currency', (
              array_agg(p.currency order by p.created_at desc)
            )[1],
            'session', max(p.price_amount) filter (
              where p.is_active and p.plan_type in ('one_time', 'session')
            ),
            'monthly', max(p.price_amount) filter (
              where p.is_active and p.plan_type = 'monthly'
            ),
            'yearly', max(p.price_amount) filter (
              where p.is_active and p.plan_type = 'yearly'
            )
          )
        )
        from public.stadium_plans p
        where p.stadium_id = s.id
      ),
      s.pricing
    )
    where exists (select 1 from public.stadium_plans p where p.stadium_id = s.id);
  end if;
end $$;

update public.stadiums
set pricing = '{"currency":"ETB","session":800,"monthly":4500,"yearly":48000}'::jsonb
where id = 'a1000000-0000-4000-8000-000000000001'
  and coalesce(pricing, '{}'::jsonb) = '{}'::jsonb;

update public.stadiums
set pricing = '{"currency":"ETB","monthly":12000,"yearly":120000}'::jsonb
where id = 'a1000000-0000-4000-8000-000000000002'
  and coalesce(pricing, '{}'::jsonb) = '{}'::jsonb;

update public.stadiums
set pricing = '{"currency":"ETB","session":250000,"monthly":85000,"yearly":850000}'::jsonb
where id = 'a1000000-0000-4000-8000-000000000003'
  and coalesce(pricing, '{}'::jsonb) = '{}'::jsonb;

alter table public.stadium_subscriptions
  add column if not exists plan_type text;

alter table public.stadium_bookings
  add column if not exists plan_type text;

alter table public.stadium_payments
  add column if not exists plan_type text;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'stadium_plans'
  ) then
    update public.stadium_subscriptions sub
    set plan_type = case
      when p.plan_type in ('one_time', 'session') then 'session'
      when p.plan_type in ('monthly', 'yearly') then p.plan_type
      else 'monthly'
    end
    from public.stadium_plans p
    where sub.plan_id = p.id
      and (sub.plan_type is null or sub.plan_type = '');

    update public.stadium_bookings b
    set plan_type = case
      when p.plan_type in ('one_time', 'session') then 'session'
      when p.plan_type in ('monthly', 'yearly') then p.plan_type
      else 'session'
    end
    from public.stadium_plans p
    where b.plan_id = p.id
      and (b.plan_type is null or b.plan_type = '');

    update public.stadium_payments pay
    set plan_type = case
      when p.plan_type in ('one_time', 'session') then 'session'
      when p.plan_type in ('monthly', 'yearly') then p.plan_type
      else coalesce(nullif(pay.payment_type, 'one_time'), 'session')
    end
    from public.stadium_plans p
    where pay.plan_id = p.id
      and (pay.plan_type is null or pay.plan_type = '');
  end if;
end $$;

update public.stadium_subscriptions
set plan_type = 'monthly'
where plan_type is null or plan_type = '' or plan_type = 'one_time';

update public.stadium_bookings
set plan_type = 'session'
where plan_type = 'one_time';

update public.stadium_payments
set plan_type = case
  when payment_type in ('monthly', 'yearly', 'session') then payment_type
  when payment_type = 'one_time' then 'session'
  else coalesce(nullif(plan_type, ''), 'session')
end
where plan_type is null or plan_type = '' or plan_type = 'one_time';

alter table public.stadium_payments drop constraint if exists stadium_payments_payment_type_check;
update public.stadium_payments
set payment_type = 'session'
where payment_type = 'one_time';
alter table public.stadium_payments
  add constraint stadium_payments_payment_type_check
  check (payment_type in ('monthly', 'yearly', 'session', 'refund'));

alter table public.stadium_subscriptions
  drop constraint if exists stadium_subscriptions_plan_id_fkey;
alter table public.stadium_bookings
  drop constraint if exists stadium_bookings_plan_id_fkey;
alter table public.stadium_payments
  drop constraint if exists stadium_payments_plan_id_fkey;

alter table public.stadium_subscriptions drop column if exists plan_id;
alter table public.stadium_bookings drop column if exists plan_id;
alter table public.stadium_payments drop column if exists plan_id;

alter table public.stadium_subscriptions
  alter column plan_type set default 'monthly';
alter table public.stadium_subscriptions
  alter column plan_type set not null;
alter table public.stadium_subscriptions
  drop constraint if exists stadium_subscriptions_plan_type_check;
alter table public.stadium_subscriptions
  add constraint stadium_subscriptions_plan_type_check
  check (plan_type in ('session', 'monthly', 'yearly'));

alter table public.stadium_bookings
  drop constraint if exists stadium_bookings_plan_type_check;
alter table public.stadium_bookings
  add constraint stadium_bookings_plan_type_check
  check (plan_type is null or plan_type in ('session', 'monthly', 'yearly'));

alter table public.stadium_payments
  drop constraint if exists stadium_payments_plan_type_check;
alter table public.stadium_payments
  add constraint stadium_payments_plan_type_check
  check (plan_type is null or plan_type in ('session', 'monthly', 'yearly'));

drop policy if exists stadium_plans_select on public.stadium_plans;
drop policy if exists stadium_plans_write on public.stadium_plans;
drop trigger if exists stadium_plans_updated_at on public.stadium_plans;
drop table if exists public.stadium_plans;

notify pgrst, 'reload schema';
