-- Gym venue monthly platform fee (amount in ETB), separate from per-transaction
-- commission_pct used when recording membership/class/PT payments.

alter table public.gyms
  add column if not exists monthly_payment numeric(12, 2) not null default 0
    check (monthly_payment >= 0);

comment on column public.gyms.monthly_payment is
  'Monthly platform fee charged to the gym (ETB amount). Not a commission percent.';
