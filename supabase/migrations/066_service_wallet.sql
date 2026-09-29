-- Provider wallet + Chapa booking escrow.
-- Customer pays with Chapa when booking a priced listing.
-- Funds stay in escrow until the provider marks the booking completed.
-- Decline/cancel of a paid booking refunds the customer wallet.
-- Safe to re-run after 065_my_service_listings.sql.
-- Includes service_payments from 057 so this file runs even if 057 was skipped.

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

create table if not exists public.wallets (
  user_id uuid primary key references public.users (id) on delete cascade,
  available numeric(12, 2) not null default 0 check (available >= 0),
  lifetime_earned numeric(12, 2) not null default 0 check (lifetime_earned >= 0),
  currency text not null default 'ETB',
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  is_credit boolean not null,
  kind text not null check (
    kind in ('earning', 'refund', 'withdrawal', 'withdrawal_reversal')
  ),
  note text not null default '',
  request_id uuid references public.service_requests (id) on delete set null,
  payment_id uuid references public.service_payments (id) on delete set null,
  withdrawal_id uuid,
  tx_ref text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists wallet_transactions_user_idx
  on public.wallet_transactions (user_id, created_at desc);

create unique index if not exists wallet_transactions_payment_kind_uidx
  on public.wallet_transactions (payment_id, kind)
  where payment_id is not null;

create unique index if not exists wallet_transactions_withdrawal_kind_uidx
  on public.wallet_transactions (withdrawal_id, kind)
  where withdrawal_id is not null;

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  bank_name text not null default '',
  account_name text not null default '',
  account_number text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'rejected')),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists withdrawal_requests_user_idx
  on public.withdrawal_requests (user_id, created_at desc);

create index if not exists withdrawal_requests_status_idx
  on public.withdrawal_requests (status, created_at desc);

alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_withdrawal_id_fkey;
alter table public.wallet_transactions
  add constraint wallet_transactions_withdrawal_id_fkey
  foreign key (withdrawal_id) references public.withdrawal_requests (id)
  on delete set null;

drop trigger if exists wallets_updated_at on public.wallets;
create trigger wallets_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

drop trigger if exists withdrawal_requests_updated_at on public.withdrawal_requests;
create trigger withdrawal_requests_updated_at
  before update on public.withdrawal_requests
  for each row execute function public.set_updated_at();

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.withdrawal_requests enable row level security;

drop policy if exists wallets_select on public.wallets;
create policy wallets_select on public.wallets
  for select using (
    public.is_current_football_user(user_id)
    or public.has_admin_permission('requests:read')
  );

drop policy if exists wallet_transactions_select on public.wallet_transactions;
create policy wallet_transactions_select on public.wallet_transactions
  for select using (
    public.is_current_football_user(user_id)
    or public.has_admin_permission('requests:read')
  );

drop policy if exists withdrawal_requests_select on public.withdrawal_requests;
create policy withdrawal_requests_select on public.withdrawal_requests
  for select using (
    public.is_current_football_user(user_id)
    or public.has_admin_permission('requests:read')
  );

grant select on public.wallets to authenticated;
grant select on public.wallet_transactions to authenticated;
grant select on public.withdrawal_requests to authenticated;

create or replace function public._ensure_wallet(p_user_id uuid)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.wallets%rowtype;
begin
  insert into public.wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
  select * into row from public.wallets where user_id = p_user_id;
  return row;
end;
$$;

revoke all on function public._ensure_wallet(uuid) from public, anon, authenticated;

create or replace function public._wallet_apply(
  p_user_id uuid,
  p_amount numeric,
  p_is_credit boolean,
  p_kind text,
  p_note text default '',
  p_request_id uuid default null,
  p_payment_id uuid default null,
  p_withdrawal_id uuid default null,
  p_tx_ref text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet public.wallets%rowtype;
  amount numeric(12, 2) := round(coalesce(p_amount, 0), 2);
begin
  if p_user_id is null or amount <= 0 then
    return;
  end if;

  if p_payment_id is not null and exists (
    select 1
    from public.wallet_transactions
    where payment_id = p_payment_id and kind = p_kind
  ) then
    return;
  end if;

  if p_withdrawal_id is not null and exists (
    select 1
    from public.wallet_transactions
    where withdrawal_id = p_withdrawal_id and kind = p_kind
  ) then
    return;
  end if;

  perform public._ensure_wallet(p_user_id);
  select * into wallet from public.wallets where user_id = p_user_id for update;

  if p_is_credit then
    update public.wallets
      set available = available + amount,
          lifetime_earned = case
            when p_kind = 'earning' then lifetime_earned + amount
            else lifetime_earned
          end
      where user_id = p_user_id;
  else
    if wallet.available < amount then
      raise exception 'insufficient_wallet';
    end if;
    update public.wallets
      set available = available - amount
      where user_id = p_user_id;
  end if;

  insert into public.wallet_transactions (
    user_id, amount, is_credit, kind, note,
    request_id, payment_id, withdrawal_id, tx_ref
  )
  values (
    p_user_id, amount, p_is_credit, p_kind, coalesce(p_note, ''),
    p_request_id, p_payment_id, p_withdrawal_id, coalesce(p_tx_ref, '')
  );
end;
$$;

revoke all on function public._wallet_apply(
  uuid, numeric, boolean, text, text, uuid, uuid, uuid, text
) from public, anon, authenticated;

create or replace function public._completed_service_payment(p_request_id uuid)
returns public.service_payments
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pay public.service_payments%rowtype;
begin
  select * into pay
  from public.service_payments
  where request_id = p_request_id
    and status = 'completed'
  order by paid_at desc nulls last, created_at desc
  limit 1;
  return pay;
end;
$$;

revoke all on function public._completed_service_payment(uuid)
  from public, anon, authenticated;

create or replace function public._refund_service_if_paid(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.service_requests%rowtype;
  pay public.service_payments%rowtype;
begin
  select * into req from public.service_requests where id = p_request_id;
  if not found then
    return;
  end if;

  update public.service_payments
    set status = 'cancelled'
    where request_id = req.id and status = 'pending';

  pay := public._completed_service_payment(req.id);
  if pay.id is null then
    return;
  end if;

  perform public._wallet_apply(
    req.requester_id,
    pay.amount,
    true,
    'refund',
    'Booking refund',
    req.id,
    pay.id,
    null,
    coalesce(pay.provider_ref, '')
  );
end;
$$;

revoke all on function public._refund_service_if_paid(uuid)
  from public, anon, authenticated;

create or replace function public.create_service_booking(
  p_service_id uuid,
  p_message text default '',
  p_location text default '',
  p_requested_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_football_user_id();
  listing public.services%rowtype;
  req public.service_requests%rowtype;
  payment_id uuid;
  priced boolean;
  when_at timestamptz := p_requested_at;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;
  if p_service_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_service');
  end if;

  select * into listing from public.services where id = p_service_id;
  if not found or listing.published is not true then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if listing.provider_id is not distinct from me then
    return jsonb_build_object('ok', false, 'error', 'own_listing');
  end if;

  priced := public.service_listing_is_priced(listing.pricing_type, listing.price_amount);

  insert into public.service_requests (
    service_id,
    requester_id,
    provider_id,
    message,
    location,
    requested_on,
    requested_at,
    status
  )
  values (
    listing.id,
    me,
    listing.provider_id,
    coalesce(p_message, ''),
    coalesce(p_location, ''),
    case when when_at is null then null else (when_at at time zone 'utc')::date end,
    when_at,
    case when priced then 'awaiting_payment' else 'pending' end
  )
  returning * into req;

  if priced then
    insert into public.service_payments (
      request_id, user_id, service_id, amount, currency, status
    )
    values (
      req.id,
      me,
      listing.id,
      listing.price_amount,
      coalesce(nullif(listing.currency, ''), 'ETB'),
      'pending'
    )
    returning id into payment_id;
    return jsonb_build_object(
      'ok', true,
      'request_id', req.id,
      'payment_id', payment_id,
      'status', 'awaiting_payment',
      'needs_payment', true,
      'amount', listing.price_amount,
      'currency', coalesce(nullif(listing.currency, ''), 'ETB')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'request_id', req.id,
    'status', 'pending',
    'needs_payment', false
  );
end;
$$;

grant execute on function public.create_service_booking(uuid, text, text, timestamptz)
  to authenticated;

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
    if req.status not in ('pending', 'awaiting_payment', 'accepted') then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;
    perform public._refund_service_if_paid(req.id);
    update public.service_requests
      set status = 'cancelled'
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
    if priced then
      pay := public._completed_service_payment(req.id);
      if pay.id is null then
        return jsonb_build_object('ok', false, 'error', 'payment_required');
      end if;
      perform public._wallet_apply(
        req.provider_id,
        pay.amount,
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
      set status = 'completed'
      where id = req.id;
    return jsonb_build_object('ok', true, 'status', 'completed');
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end;
$$;

grant execute on function public.transition_service_request(uuid, text) to authenticated;

create or replace function public.request_wallet_withdrawal(
  p_amount numeric,
  p_bank_name text,
  p_account_name text,
  p_account_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_football_user_id();
  amount numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  bank text := btrim(coalesce(p_bank_name, ''));
  holder text := btrim(coalesce(p_account_name, ''));
  acct text := btrim(coalesce(p_account_number, ''));
  row_id uuid;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;
  if amount < 10 then
    return jsonb_build_object('ok', false, 'error', 'min_withdrawal');
  end if;
  if bank = '' or holder = '' or acct = '' then
    return jsonb_build_object('ok', false, 'error', 'bank_required');
  end if;

  insert into public.withdrawal_requests (
    user_id, amount, bank_name, account_name, account_number, status
  )
  values (me, amount, bank, holder, acct, 'pending')
  returning id into row_id;

  begin
    perform public._wallet_apply(
      me, amount, false, 'withdrawal', 'Withdrawal request',
      null, null, row_id, ''
    );
  exception
    when others then
      delete from public.withdrawal_requests where id = row_id;
      if sqlerrm like '%insufficient_wallet%' then
        return jsonb_build_object('ok', false, 'error', 'insufficient_wallet');
      end if;
      raise;
  end;

  return jsonb_build_object('ok', true, 'id', row_id, 'status', 'pending');
end;
$$;

grant execute on function public.request_wallet_withdrawal(numeric, text, text, text)
  to authenticated;

create or replace function public.resolve_wallet_withdrawal(
  p_id uuid,
  p_action text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  action text := lower(btrim(coalesce(p_action, '')));
  req public.withdrawal_requests%rowtype;
begin
  if not public.has_admin_permission('requests:write') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into req from public.withdrawal_requests where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  if action = 'reject' then
    perform public._wallet_apply(
      req.user_id,
      req.amount,
      true,
      'withdrawal_reversal',
      'Withdrawal rejected',
      null,
      null,
      req.id,
      ''
    );
    update public.withdrawal_requests
      set status = 'rejected',
          admin_note = coalesce(p_note, '')
      where id = req.id;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  if action in ('paid', 'approve') then
    update public.withdrawal_requests
      set status = 'paid',
          admin_note = coalesce(p_note, '')
      where id = req.id;
    return jsonb_build_object('ok', true, 'status', 'paid');
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end;
$$;

grant execute on function public.resolve_wallet_withdrawal(uuid, text, text)
  to authenticated;

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
