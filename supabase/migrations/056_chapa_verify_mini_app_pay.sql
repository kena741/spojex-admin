-- Mini-app Chapa payments + server-side Chapa verify for all live checkouts.
-- Buyers can attach a tx_ref or cancel pending rows. Completed is set only after
-- Chapa verify succeeds (SECURITY DEFINER).
-- Safe to re-run after 055_saved_items_chat_media.sql.
--
-- One-time secret (SQL editor, never commit the key):
--   select vault.create_secret('CHASECK_TEST-...', 'chapa_secret_key', 'Chapa secret');

create extension if not exists http with schema extensions;

create table if not exists public.mini_app_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  mini_app_key text not null,
  title text not null default 'Mini-app payment',
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'ETB',
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled', 'failed')),
  provider_ref text not null default '',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mini_app_payments_user_idx
  on public.mini_app_payments (user_id, created_at desc);

alter table public.mini_app_payments enable row level security;

drop policy if exists mini_app_payments_select on public.mini_app_payments;
create policy mini_app_payments_select on public.mini_app_payments
  for select using (
    public.is_current_football_user(user_id)
    or public.has_admin_permission('miniapps:read')
  );

drop policy if exists mini_app_payments_insert on public.mini_app_payments;
create policy mini_app_payments_insert on public.mini_app_payments
  for insert with check (
    public.is_current_football_user(user_id)
    and status = 'pending'
  );

drop policy if exists mini_app_payments_update on public.mini_app_payments;
create policy mini_app_payments_update on public.mini_app_payments
  for update using (
    public.is_current_football_user(user_id)
    and status = 'pending'
  )
  with check (
    public.is_current_football_user(user_id)
    and status in ('pending', 'cancelled', 'failed')
  );

grant select, insert, update on public.mini_app_payments to authenticated;

-- Buyers may cancel or attach provider_ref. They may not mark completed.
drop policy if exists donation_contributions_update on public.donation_contributions;
create policy donation_contributions_update on public.donation_contributions
  for update using (
    public.is_current_football_user(user_id)
    and status = 'pending'
  )
  with check (
    public.is_current_football_user(user_id)
    and status in ('pending', 'cancelled')
  );

drop policy if exists event_payments_update on public.event_payments;
create policy event_payments_update on public.event_payments
  for update using (
    (
      public.is_current_football_user(user_id)
      and status = 'pending'
    )
    or public.can_manage_event(event_id)
    or public.has_admin_permission('events:write')
  )
  with check (
    (
      public.is_current_football_user(user_id)
      and status in ('pending', 'cancelled', 'failed')
    )
    or public.can_manage_event(event_id)
    or public.has_admin_permission('events:write')
  );

drop policy if exists event_tickets_update on public.event_tickets;
create policy event_tickets_update on public.event_tickets
  for update using (
    (
      public.is_current_football_user(user_id)
      and status = 'pending'
    )
    or public.can_manage_event(event_id)
    or public.has_admin_permission('events:write')
  )
  with check (
    (
      public.is_current_football_user(user_id)
      and status in ('pending', 'cancelled')
    )
    or public.can_manage_event(event_id)
    or public.has_admin_permission('events:write')
  );

drop policy if exists stadium_payments_update on public.stadium_payments;
create policy stadium_payments_update on public.stadium_payments
  for update using (
    (
      public.is_current_football_user(user_id)
      and status = 'pending'
    )
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  )
  with check (
    (
      public.is_current_football_user(user_id)
      and status in ('pending', 'failed')
    )
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  );

drop policy if exists stadium_subscriptions_update on public.stadium_subscriptions;
create policy stadium_subscriptions_update on public.stadium_subscriptions
  for update using (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  )
  with check (
    (
      public.is_current_football_user(user_id)
      and status in ('pending', 'cancelled')
    )
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  );

drop policy if exists stadium_bookings_update on public.stadium_bookings;
create policy stadium_bookings_update on public.stadium_bookings
  for update using (
    public.is_current_football_user(user_id)
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  )
  with check (
    (
      public.is_current_football_user(user_id)
      and status in ('pending', 'cancelled')
    )
    or public.can_manage_stadium(stadium_id)
    or public.has_admin_permission('stadiums:write')
  );

create or replace function public._chapa_secret()
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  secret text;
begin
  begin
    select ds.decrypted_secret
      into secret
    from vault.decrypted_secrets ds
    where ds.name = 'chapa_secret_key'
    limit 1;
  exception
    when others then
      secret := null;
  end;
  if secret is null or btrim(secret) = '' then
    secret := nullif(current_setting('app.settings.chapa_secret_key', true), '');
  end if;
  return nullif(btrim(coalesce(secret, '')), '');
end;
$$;

revoke all on function public._chapa_secret() from public, anon, authenticated;

create or replace function public._chapa_verify_tx(p_tx_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  secret text;
  response extensions.http_response;
  payload jsonb;
  url text;
begin
  if p_tx_ref is null or btrim(p_tx_ref) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_tx_ref');
  end if;
  secret := public._chapa_secret();
  if secret is null then
    return jsonb_build_object('ok', false, 'error', 'chapa_secret_missing');
  end if;
  url := 'https://api.chapa.co/v1/transaction/verify/' || btrim(p_tx_ref);
  begin
    select *
      into response
    from extensions.http((
      'GET',
      url,
      array[
        extensions.http_header('Authorization', 'Bearer ' || secret),
        extensions.http_header('Accept', 'application/json')
      ],
      null,
      null
    )::extensions.http_request);
  exception
    when others then
      return jsonb_build_object('ok', false, 'error', 'chapa_http_failed');
  end;
  begin
    payload := response.content::jsonb;
  exception
    when others then
      return jsonb_build_object('ok', false, 'error', 'chapa_invalid_response');
  end;
  if response.status < 200 or response.status >= 300 then
    return jsonb_build_object(
      'ok', false,
      'error', 'chapa_verify_rejected',
      'status_code', response.status
    );
  end if;
  if lower(coalesce(payload->>'status', '')) <> 'success' then
    return jsonb_build_object('ok', false, 'error', 'chapa_not_success', 'body', payload);
  end if;
  if lower(coalesce(payload->'data'->>'status', '')) not in ('success', 'paid') then
    return jsonb_build_object('ok', false, 'error', 'chapa_unpaid', 'body', payload);
  end if;
  return jsonb_build_object('ok', true, 'data', payload->'data');
end;
$$;

revoke all on function public._chapa_verify_tx(text) from public, anon, authenticated;

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
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_kind');
end;
$$;

grant execute on function public.confirm_chapa_payment(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
