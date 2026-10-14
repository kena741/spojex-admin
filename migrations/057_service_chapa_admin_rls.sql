-- Service Chapa payments, booking status machine, admin marketplace read.
-- Safe to re-run after 056_chapa_verify_mini_app_pay.sql.
-- Completed is set only by confirm_chapa_payment (SECURITY DEFINER).

create table if not exists public.service_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'ETB',
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled', 'failed')),
  provider_ref text not null default '',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists service_payments_request_idx
  on public.service_payments (request_id, created_at desc);

create unique index if not exists service_payments_pending_request_idx
  on public.service_payments (request_id)
  where status = 'pending';

alter table public.service_payments enable row level security;

drop policy if exists service_payments_select on public.service_payments;
create policy service_payments_select on public.service_payments
  for select using (
    public.is_current_football_user(user_id)
    or exists (
      select 1
      from public.service_requests r
      where r.id = request_id
        and public.is_current_football_user(r.provider_id)
    )
    or public.has_admin_permission('requests:read')
    or public.has_admin_permission('services:read')
  );

drop policy if exists service_payments_insert on public.service_payments;
create policy service_payments_insert on public.service_payments
  for insert with check (
    public.is_current_football_user(user_id)
    and status = 'pending'
  );

drop policy if exists service_payments_update on public.service_payments;
create policy service_payments_update on public.service_payments
  for update using (
    public.is_current_football_user(user_id)
    and status = 'pending'
  )
  with check (
    public.is_current_football_user(user_id)
    and status in ('pending', 'cancelled', 'failed')
  );

grant select, insert, update on public.service_payments to authenticated;

alter table public.service_requests
  drop constraint if exists service_requests_status_check;
alter table public.service_requests
  add constraint service_requests_status_check check (
    status in (
      'pending',
      'awaiting_payment',
      'accepted',
      'declined',
      'completed',
      'cancelled'
    )
  );

drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select using (
    published = true
    or public.is_current_football_user(provider_id)
    or public.has_admin_permission('services:read')
  );

drop policy if exists services_update on public.services;
create policy services_update on public.services
  for update using (
    public.is_current_football_user(provider_id)
    or public.has_admin_permission('services:write')
  )
  with check (
    public.is_current_football_user(provider_id)
    or public.has_admin_permission('services:write')
  );

drop policy if exists services_delete on public.services;
create policy services_delete on public.services
  for delete using (
    public.is_current_football_user(provider_id)
    or public.has_admin_permission('services:write')
  );

drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests
  for select using (
    public.is_current_football_user(requester_id)
    or public.is_current_football_user(provider_id)
    or public.has_admin_permission('requests:read')
  );

-- Status changes go through transition_service_request, not client updates.
drop policy if exists service_requests_update on public.service_requests;

create or replace function public.service_listing_is_priced(
  p_pricing_type text,
  p_amount numeric
)
returns boolean
language sql
immutable
as $$
  select coalesce(p_pricing_type, '') not in ('free', 'custom_quote')
    and coalesce(p_amount, 0) > 0;
$$;

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
  priced boolean;
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

  if action = 'cancel' then
    if req.requester_id is distinct from me then
      return jsonb_build_object('ok', false, 'error', 'not_allowed');
    end if;
    if req.status not in ('pending', 'awaiting_payment') then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;
    update public.service_payments
      set status = 'cancelled'
      where request_id = req.id and status = 'pending';
    update public.service_requests
      set status = 'cancelled'
      where id = req.id;
    return jsonb_build_object('ok', true, 'status', 'cancelled');

  elsif action = 'decline' then
    if req.provider_id is distinct from me
       and not public.has_admin_permission('requests:write') then
      return jsonb_build_object('ok', false, 'error', 'not_allowed');
    end if;
    if req.status not in ('pending', 'awaiting_payment') then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;
    update public.service_payments
      set status = 'cancelled'
      where request_id = req.id and status = 'pending';
    update public.service_requests
      set status = 'declined'
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
        set status = 'awaiting_payment'
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
      set status = 'accepted'
      where id = req.id;
    return jsonb_build_object('ok', true, 'status', 'accepted', 'needs_payment', false);

  elsif action = 'complete' then
    if req.provider_id is distinct from me
       and not public.has_admin_permission('requests:write') then
      return jsonb_build_object('ok', false, 'error', 'not_allowed');
    end if;
    if req.status <> 'accepted' then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;
    update public.service_requests
      set status = 'completed'
      where id = req.id;
    return jsonb_build_object('ok', true, 'status', 'completed');
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end;
$$;

grant execute on function public.transition_service_request(uuid, text) to authenticated;

create or replace function public.confirm_chapa_payment(
  p_kind text,
  p_payment_id uuid,
  p_tx_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text := lower(btrim(coalesce(p_kind, '')));
  me uuid := public.current_football_user_id();
  verified jsonb;
  chapa_ref text;
  chapa_amount numeric;
  chapa_currency text;
  row_amount numeric;
  row_currency text;
  ticket uuid;
  sub uuid;
  booking uuid;
  request uuid;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;
  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_payment');
  end if;

  verified := public._chapa_verify_tx(p_tx_ref);
  if coalesce((verified->>'ok')::boolean, false) is not true then
    return verified;
  end if;

  chapa_ref := coalesce(verified->'data'->>'tx_ref', btrim(p_tx_ref));
  chapa_amount := nullif(verified->'data'->>'amount', '')::numeric;
  chapa_currency := upper(coalesce(verified->'data'->>'currency', 'ETB'));

  if kind = 'donation' then
    select amount, currency
      into row_amount, row_currency
    from public.donation_contributions
    where id = p_payment_id
      and public.is_current_football_user(user_id);
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if exists (
      select 1 from public.donation_contributions
      where id = p_payment_id and status = 'completed'
    ) then
      return jsonb_build_object('ok', true, 'status', 'completed', 'kind', kind);
    end if;
    if chapa_amount is not null and abs(chapa_amount - row_amount) > 0.05 then
      return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
    end if;
    if chapa_currency <> upper(coalesce(row_currency, 'ETB')) then
      return jsonb_build_object('ok', false, 'error', 'currency_mismatch');
    end if;
    update public.donation_contributions
    set status = 'completed',
        provider_ref = chapa_ref,
        paid_at = timezone('utc', now())
    where id = p_payment_id
      and status = 'pending';
    return jsonb_build_object('ok', true, 'status', 'completed', 'kind', kind);

  elsif kind = 'event' then
    select amount, currency, ticket_id
      into row_amount, row_currency, ticket
    from public.event_payments
    where id = p_payment_id
      and public.is_current_football_user(user_id);
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if exists (
      select 1 from public.event_payments
      where id = p_payment_id and status = 'completed'
    ) then
      return jsonb_build_object('ok', true, 'status', 'completed', 'kind', kind);
    end if;
    if chapa_amount is not null and abs(chapa_amount - row_amount) > 0.05 then
      return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
    end if;
    update public.event_payments
    set status = 'completed',
        provider_ref = chapa_ref,
        paid_at = timezone('utc', now())
    where id = p_payment_id
      and status = 'pending';
    if ticket is not null then
      update public.event_tickets
      set status = 'confirmed'
      where id = ticket
        and status = 'pending';
    end if;
    return jsonb_build_object('ok', true, 'status', 'completed', 'kind', kind);

  elsif kind = 'stadium' then
    select amount, currency, subscription_id, booking_id
      into row_amount, row_currency, sub, booking
    from public.stadium_payments
    where id = p_payment_id
      and public.is_current_football_user(user_id);
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if exists (
      select 1 from public.stadium_payments
      where id = p_payment_id and status = 'completed'
    ) then
      return jsonb_build_object('ok', true, 'status', 'completed', 'kind', kind);
    end if;
    if chapa_amount is not null and abs(chapa_amount - row_amount) > 0.05 then
      return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
    end if;
    update public.stadium_payments
    set status = 'completed',
        provider_ref = chapa_ref,
        payment_method = 'app',
        paid_at = timezone('utc', now())
    where id = p_payment_id
      and status = 'pending';
    if sub is not null then
      update public.stadium_subscriptions
      set status = 'active'
      where id = sub
        and status = 'pending';
    end if;
    if booking is not null then
      update public.stadium_bookings
      set status = 'confirmed'
      where id = booking
        and status = 'pending';
    end if;
    return jsonb_build_object('ok', true, 'status', 'completed', 'kind', kind);

  elsif kind in ('mini_app', 'miniapp') then
    select amount, currency
      into row_amount, row_currency
    from public.mini_app_payments
    where id = p_payment_id
      and public.is_current_football_user(user_id);
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if exists (
      select 1 from public.mini_app_payments
      where id = p_payment_id and status = 'completed'
    ) then
      return jsonb_build_object('ok', true, 'status', 'completed', 'kind', 'mini_app');
    end if;
    if chapa_amount is not null and abs(chapa_amount - row_amount) > 0.05 then
      return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
    end if;
    update public.mini_app_payments
    set status = 'completed',
        provider_ref = chapa_ref,
        paid_at = timezone('utc', now())
    where id = p_payment_id
      and status = 'pending';
    return jsonb_build_object('ok', true, 'status', 'completed', 'kind', 'mini_app');

  elsif kind = 'service' then
    select amount, currency, request_id
      into row_amount, row_currency, request
    from public.service_payments
    where id = p_payment_id
      and public.is_current_football_user(user_id);
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if exists (
      select 1 from public.service_payments
      where id = p_payment_id and status = 'completed'
    ) then
      return jsonb_build_object('ok', true, 'status', 'completed', 'kind', kind);
    end if;
    if chapa_amount is not null and abs(chapa_amount - row_amount) > 0.05 then
      return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
    end if;
    if chapa_currency <> upper(coalesce(row_currency, 'ETB')) then
      return jsonb_build_object('ok', false, 'error', 'currency_mismatch');
    end if;
    update public.service_payments
    set status = 'completed',
        provider_ref = chapa_ref,
        paid_at = timezone('utc', now())
    where id = p_payment_id
      and status = 'pending';
    if request is not null then
      update public.service_requests
      set status = 'accepted'
      where id = request
        and status = 'awaiting_payment';
    end if;
    return jsonb_build_object('ok', true, 'status', 'completed', 'kind', kind);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_kind');
end;
$$;

grant execute on function public.confirm_chapa_payment(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
