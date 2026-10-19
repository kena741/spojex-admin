-- Monthly service billing cycles + dual complete + commission on wallet credit.
-- Safe to re-run.

-- Allow monthly pricing on listings.
alter table public.services drop constraint if exists services_pricing_type_check;
alter table public.services
  add constraint services_pricing_type_check check (
    pricing_type in (
      'fixed', 'starting', 'hourly', 'per_session', 'per_day',
      'custom_quote', 'free', 'monthly'
    )
  );

alter table public.service_requests
  add column if not exists completed_by uuid references public.users (id) on delete set null;
alter table public.service_requests
  add column if not exists completed_at timestamptz;
alter table public.service_requests
  add column if not exists current_cycle_id uuid;

create table if not exists public.service_billing_cycles (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  cycle_index integer not null check (cycle_index > 0),
  period_start date,
  period_end date,
  due_at timestamptz not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'ETB',
  status text not null default 'due'
    check (status in (
      'due', 'awaiting_payment', 'paid', 'completed', 'overdue', 'cancelled'
    )),
  payment_id uuid references public.service_payments (id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.users (id) on delete set null,
  credited_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, cycle_index)
);

create index if not exists service_billing_cycles_request_idx
  on public.service_billing_cycles (request_id, cycle_index desc);
create index if not exists service_billing_cycles_due_idx
  on public.service_billing_cycles (status, due_at);

alter table public.service_payments
  add column if not exists billing_cycle_id uuid
    references public.service_billing_cycles (id) on delete set null;

create index if not exists service_payments_billing_cycle_idx
  on public.service_payments (billing_cycle_id);

alter table public.service_requests
  drop constraint if exists service_requests_current_cycle_fk;
alter table public.service_requests
  add constraint service_requests_current_cycle_fk
  foreign key (current_cycle_id)
  references public.service_billing_cycles (id)
  on delete set null;

alter table public.service_billing_cycles enable row level security;

drop policy if exists service_billing_cycles_select on public.service_billing_cycles;
create policy service_billing_cycles_select on public.service_billing_cycles
  for select using (
    exists (
      select 1 from public.service_requests r
      where r.id = request_id
        and (
          public.is_current_football_user(r.requester_id)
          or public.is_current_football_user(r.provider_id)
        )
    )
    or public.has_admin_permission('requests:read')
    or public.has_admin_permission('services:read')
  );

grant select on public.service_billing_cycles to authenticated;

-- Commission helper: net provider amount from admin_commission settings.
create or replace function public._service_provider_net(p_gross numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  raw jsonb;
  active boolean := true;
  is_fix boolean := false;
  value numeric := 10;
  gross numeric(12, 2) := round(coalesce(p_gross, 0), 2);
  fee numeric(12, 2);
begin
  if gross <= 0 then
    return 0;
  end if;
  select data into raw from public.app_settings where id = 'admin_commission' limit 1;
  if raw is not null then
    active := coalesce((raw ->> 'active')::boolean, true);
    is_fix := coalesce((raw ->> 'isFix')::boolean, false);
    value := coalesce(nullif(raw ->> 'value', '')::numeric, 10);
  end if;
  if not active then
    return gross;
  end if;
  if is_fix then
    fee := least(round(value, 2), gross);
  else
    fee := round(gross * greatest(value, 0) / 100.0, 2);
    if fee > gross then
      fee := gross;
    end if;
  end if;
  return gross - fee;
end;
$$;

revoke all on function public._service_provider_net(numeric)
  from public, anon, authenticated;

create or replace function public.transition_service_request(
  p_request_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_football_user_id();
  action text := lower(btrim(coalesce(p_action, '')));
  req public.service_requests%rowtype;
  listing public.services%rowtype;
  payment_id uuid;
  pay public.service_payments%rowtype;
  priced boolean;
  monthly boolean;
  net_amount numeric(12, 2);
  cycle public.service_billing_cycles%rowtype;
  next_cycle_id uuid;
  next_due timestamptz;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;
  if p_request_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_request');
  end if;

  select * into req from public.service_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into listing from public.services where id = req.service_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  priced := public.service_listing_is_priced(listing.pricing_type, listing.price_amount);
  monthly := lower(coalesce(listing.pricing_type, '')) in ('monthly', 'recurring_monthly', 'per_month');

  if action = 'cancel' then
    if req.requester_id is distinct from me then
      return jsonb_build_object('ok', false, 'error', 'not_allowed');
    end if;
    if req.status not in ('pending', 'awaiting_payment', 'accepted') then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;
    perform public._refund_service_if_paid(req.id);
    update public.service_requests
      set status = 'cancelled', updated_at = now()
      where id = req.id;
    return jsonb_build_object('ok', true, 'status', 'cancelled');

  elsif action = 'decline' then
    if req.provider_id is distinct from me
       and not public.has_admin_permission('requests:write') then
      return jsonb_build_object('ok', false, 'error', 'not_allowed');
    end if;
    if req.status not in ('pending', 'awaiting_payment', 'accepted') then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;
    perform public._refund_service_if_paid(req.id);
    update public.service_requests
      set status = 'declined', updated_at = now()
      where id = req.id;
    return jsonb_build_object('ok', true, 'status', 'declined');

  elsif action = 'accept' then
    if req.provider_id is distinct from me
       and not public.has_admin_permission('requests:write') then
      return jsonb_build_object('ok', false, 'error', 'not_allowed');
    end if;
    if req.status <> 'pending' then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;
    if priced then
      insert into public.service_payments (
        request_id, user_id, service_id, amount, currency, status
      )
      values (
        req.id,
        req.requester_id,
        req.service_id,
        listing.price_amount,
        coalesce(nullif(listing.currency, ''), 'ETB'),
        'pending'
      )
      returning id into payment_id;
      update public.service_requests
        set status = 'awaiting_payment', updated_at = now()
        where id = req.id;
      return jsonb_build_object(
        'ok', true,
        'status', 'awaiting_payment',
        'needs_payment', true,
        'payment_id', payment_id,
        'amount', listing.price_amount,
        'currency', coalesce(nullif(listing.currency, ''), 'ETB')
      );
    end if;
    update public.service_requests
      set status = 'accepted', updated_at = now()
      where id = req.id;
    return jsonb_build_object('ok', true, 'status', 'accepted', 'needs_payment', false);

  elsif action = 'complete' then
    -- Customer or provider (or admin) may mark completed.
    if req.provider_id is distinct from me
       and req.requester_id is distinct from me
       and not public.has_admin_permission('requests:write') then
      return jsonb_build_object('ok', false, 'error', 'not_allowed');
    end if;
    if req.status <> 'accepted' then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;

    if monthly then
      select * into cycle
      from public.service_billing_cycles
      where request_id = req.id and status = 'paid'
      order by cycle_index desc
      limit 1;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'payment_required');
      end if;
      pay := public._completed_service_payment(req.id);
      if pay.id is null or (cycle.payment_id is not null and pay.id is distinct from cycle.payment_id) then
        select * into pay from public.service_payments
        where id = cycle.payment_id and status = 'completed';
      end if;
      if pay.id is null then
        return jsonb_build_object('ok', false, 'error', 'payment_required');
      end if;
      net_amount := public._service_provider_net(pay.amount);
      perform public._wallet_apply(
        req.provider_id,
        net_amount,
        true,
        'earning',
        coalesce(nullif(listing.title, ''), 'Service booking'),
        req.id,
        pay.id,
        null,
        coalesce(pay.provider_ref, '')
      );
      update public.service_billing_cycles
        set status = 'completed',
            completed_at = now(),
            completed_by = me,
            credited_at = now(),
            updated_at = now()
        where id = cycle.id;

      next_due := coalesce(
        cycle.period_end::timestamp at time zone 'utc',
        now()
      ) + interval '1 month';
      insert into public.service_billing_cycles (
        request_id, service_id, cycle_index, period_start, period_end,
        due_at, amount, currency, status
      )
      values (
        req.id,
        req.service_id,
        cycle.cycle_index + 1,
        coalesce(cycle.period_end, current_date),
        (coalesce(cycle.period_end, current_date) + interval '1 month')::date,
        next_due,
        coalesce(listing.price_amount, cycle.amount),
        coalesce(nullif(listing.currency, ''), cycle.currency, 'ETB'),
        'due'
      )
      returning id into next_cycle_id;

      update public.service_requests
        set status = 'accepted',
            current_cycle_id = next_cycle_id,
            updated_at = now()
        where id = req.id;
      return jsonb_build_object(
        'ok', true,
        'status', 'accepted',
        'monthly', true,
        'cycle_completed', true,
        'next_cycle_id', next_cycle_id
      );
    end if;

    if priced then
      pay := public._completed_service_payment(req.id);
      if pay.id is null then
        return jsonb_build_object('ok', false, 'error', 'payment_required');
      end if;
      net_amount := public._service_provider_net(pay.amount);
      perform public._wallet_apply(
        req.provider_id,
        net_amount,
        true,
        'earning',
        coalesce(nullif(listing.title, ''), 'Service booking'),
        req.id,
        pay.id,
        null,
        coalesce(pay.provider_ref, '')
      );
    end if;
    update public.service_requests
      set status = 'completed',
          completed_by = me,
          completed_at = now(),
          updated_at = now()
      where id = req.id;
    return jsonb_build_object('ok', true, 'status', 'completed');
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end;
$$;

grant execute on function public.transition_service_request(uuid, text) to authenticated;
