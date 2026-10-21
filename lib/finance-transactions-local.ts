/**
 * Local finance aggregation via admin DB client.
 * Used when the Python /api/v1/admin/finance/* endpoints are unavailable (404),
 * so the Admin UI still surfaces real data instead of a false empty state.
 */
import { createAdminClient } from "@/lib/spojex/admin";

const PAID = new Set(["paid", "success", "completed", "verified"]);
const PENDING = new Set(["pending", "processing"]);
const REFUND = new Set(["refunded", "partial_refund"]);
const FAILED = new Set(["failed", "cancelled", "canceled", "rejected"]);

type TxOut = {
  id: string;
  source: string;
  source_id: string;
  asset_class: string;
  currency: string;
  amount: string;
  status: string;
  status_group: string;
  direction: string;
  tx_type: string;
  module: string;
  purpose: string;
  provider_ref: string | null;
  payment_provider: string;
  payer: { id: string; display_name: string | null; email: string | null; role: string | null } | null;
  beneficiary: { id: string; display_name: string | null; email: string | null; role: string | null } | null;
  platform_commission: string | null;
  recipient_net: string | null;
  occurred_at: string | null;
  created_at: string | null;
  verified_at: string | null;
  is_sale: boolean;
};

function money(n: unknown) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

function statusGroup(status: string) {
  const s = status.toLowerCase();
  if (PAID.has(s)) return "verified";
  if (REFUND.has(s)) return "refunded";
  if (PENDING.has(s)) return "pending";
  if (FAILED.has(s)) return "failed";
  if (s === "paid" || s === "completed") return "paid";
  return s || "unknown";
}

function windowIso(range: string) {
  const end = new Date();
  const start = new Date(end);
  const days = range === "7d" ? 7 : range === "90d" ? 90 : range === "365d" ? 365 : 30;
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function userMap(client: ReturnType<typeof createAdminClient>, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map: Record<string, { id: string; display_name: string | null; email: string | null; role: string | null }> =
    {};
  if (!unique.length) return map;
  const { data } = await client
    .from("users")
    .select("id, display_name, email, role")
    .in("id", unique.slice(0, 500));
  for (const u of data ?? []) {
    map[String(u.id)] = {
      id: String(u.id),
      display_name: u.display_name ?? null,
      email: u.email ?? null,
      role: u.role ?? null,
    };
  }
  return map;
}

export async function listTransactionsLocal(params: {
  range?: string;
  asset_class?: string | null;
  module?: string | null;
  status?: string | null;
  tx_type?: string | null;
  provider?: string | null;
  q?: string | null;
  page?: number;
  page_size?: number;
}) {
  const client = createAdminClient();
  const { start, end } = windowIso(params.range || "30d");
  const page = Math.max(params.page || 1, 1);
  const pageSize = Math.min(Math.max(params.page_size || 40, 1), 100);
  const rows: TxOut[] = [];

  const pushPayment = (opts: {
    source: string;
    id: string;
    amount: unknown;
    currency?: string | null;
    status: string;
    purpose: string;
    module: string;
    provider_ref?: string | null;
    provider?: string;
    payer_id?: string | null;
    beneficiary_id?: string | null;
    commission?: unknown;
    net?: unknown;
    created_at?: string | null;
    paid_at?: string | null;
    is_sale?: boolean;
    tx_type?: string;
    direction?: string;
    asset_class?: string;
  }) => {
    const created = opts.created_at || opts.paid_at || null;
    if (created && (created < start || created > end)) return;
    rows.push({
      id: `${opts.source}:${opts.id}`,
      source: opts.source,
      source_id: opts.id,
      asset_class: opts.asset_class || "money",
      currency: (opts.currency || "ETB").toUpperCase() || "ETB",
      amount: money(opts.amount),
      status: opts.status,
      status_group: statusGroup(opts.status),
      direction: opts.direction || "incoming",
      tx_type: opts.tx_type || "customer_payment",
      module: opts.module,
      purpose: opts.purpose,
      provider_ref: opts.provider_ref || null,
      payment_provider: opts.provider || "chapa",
      payer: opts.payer_id ? { id: opts.payer_id, display_name: null, email: null, role: null } : null,
      beneficiary: opts.beneficiary_id
        ? { id: opts.beneficiary_id, display_name: null, email: null, role: null }
        : null,
      platform_commission: opts.commission != null ? money(opts.commission) : null,
      recipient_net: opts.net != null ? money(opts.net) : null,
      occurred_at: opts.paid_at || opts.created_at || null,
      created_at: opts.created_at || null,
      verified_at: opts.paid_at || null,
      is_sale: opts.is_sale !== false && (opts.tx_type || "customer_payment") === "customer_payment",
    });
  };

  const [
    services,
    gyms,
    stadiums,
    events,
    coins,
    donations,
    withdrawals,
    coinRedeems,
    walletTx,
    coinTx,
  ] = await Promise.all([
    client
      .from("service_payments")
      .select("id, user_id, amount, currency, status, provider_ref, paid_at, created_at, request_id")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("gym_payments")
      .select(
        "id, user_id, amount, currency, status, provider_ref, paid_at, created_at, commission_amount, gym_net_amount, payment_type",
      )
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("stadium_payments")
      .select("id, user_id, amount, currency, status, provider_ref, paid_at, created_at, payment_type, payment_method")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("event_payments")
      .select("id, user_id, amount, currency, status, provider_ref, paid_at, created_at, payment_method")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("coin_purchases")
      .select("id, user_id, price_etb, currency, status, provider_ref, paid_at, created_at, coins")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("donation_contributions")
      .select("id, user_id, amount, currency, status, provider_ref, paid_at, created_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("withdrawal_requests")
      .select("id, user_id, amount, status, created_at, updated_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(300),
    client
      .from("coin_redemptions")
      .select("id, user_id, etb_amount, coins, status, created_at, updated_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(300),
    client
      .from("wallet_transactions")
      .select("id, user_id, amount, is_credit, kind, note, created_at, payment_id, withdrawal_id, tx_ref")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("coin_transactions")
      .select("id, user_id, amount, is_credit, kind, status, note, created_at, counterparty_id, purchase_id")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  for (const r of services.data ?? []) {
    pushPayment({
      source: "service_payment",
      id: String(r.id),
      amount: r.amount,
      currency: r.currency,
      status: String(r.status),
      purpose: "Service booking payment",
      module: "service",
      provider_ref: r.provider_ref,
      payer_id: r.user_id,
      created_at: r.created_at,
      paid_at: r.paid_at,
    });
  }
  for (const r of gyms.data ?? []) {
    pushPayment({
      source: "gym_payment",
      id: String(r.id),
      amount: r.amount,
      currency: r.currency,
      status: String(r.status),
      purpose: r.payment_type || "Gym payment",
      module: "gym",
      provider_ref: r.provider_ref,
      payer_id: r.user_id,
      commission: r.commission_amount,
      net: r.gym_net_amount,
      created_at: r.created_at,
      paid_at: r.paid_at,
    });
  }
  for (const r of stadiums.data ?? []) {
    pushPayment({
      source: "stadium_payment",
      id: String(r.id),
      amount: r.amount,
      currency: r.currency,
      status: String(r.status),
      purpose: r.payment_type || "Stadium payment",
      module: "stadium",
      provider_ref: r.provider_ref,
      provider: String(r.payment_method || "").toLowerCase() === "cash" ? "cash" : "chapa",
      payer_id: r.user_id,
      created_at: r.created_at,
      paid_at: r.paid_at,
    });
  }
  for (const r of events.data ?? []) {
    pushPayment({
      source: "event_payment",
      id: String(r.id),
      amount: r.amount,
      currency: r.currency,
      status: String(r.status),
      purpose: "Event ticket payment",
      module: "event",
      provider_ref: r.provider_ref,
      provider: r.payment_method || "chapa",
      payer_id: r.user_id,
      created_at: r.created_at,
      paid_at: r.paid_at,
    });
  }
  for (const r of coins.data ?? []) {
    pushPayment({
      source: "coin_purchase",
      id: String(r.id),
      amount: r.price_etb,
      currency: r.currency || "ETB",
      status: String(r.status),
      purpose: `Coin package purchase (${r.coins ?? "?"} coins)`,
      module: "coins",
      provider_ref: r.provider_ref,
      payer_id: r.user_id,
      created_at: r.created_at,
      paid_at: r.paid_at,
    });
  }
  for (const r of donations.data ?? []) {
    pushPayment({
      source: "donation",
      id: String(r.id),
      amount: r.amount,
      currency: r.currency,
      status: String(r.status),
      purpose: "Donation contribution",
      module: "donations",
      provider_ref: r.provider_ref,
      payer_id: r.user_id,
      created_at: r.created_at,
      paid_at: r.paid_at,
      tx_type: "donation",
    });
  }
  for (const r of withdrawals.data ?? []) {
    const st = String(r.status);
    pushPayment({
      source: "withdrawal",
      id: String(r.id),
      amount: r.amount,
      currency: "ETB",
      status: st,
      purpose: "Provider wallet withdrawal",
      module: "wallet",
      provider: "manual_payout",
      payer_id: r.user_id,
      beneficiary_id: r.user_id,
      created_at: r.created_at,
      paid_at: PAID.has(st.toLowerCase()) ? r.updated_at : null,
      is_sale: false,
      tx_type: "withdrawal",
      direction: "outgoing",
    });
  }
  for (const r of coinRedeems.data ?? []) {
    const st = String(r.status);
    pushPayment({
      source: "coin_redemption",
      id: String(r.id),
      amount: r.etb_amount,
      currency: "ETB",
      status: st,
      purpose: `Coin redemption (${r.coins ?? "?"} coins)`,
      module: "coins",
      provider: "manual_payout",
      payer_id: r.user_id,
      beneficiary_id: r.user_id,
      created_at: r.created_at,
      paid_at: PAID.has(st.toLowerCase()) ? r.updated_at : null,
      is_sale: false,
      tx_type: "coin_redemption",
      direction: "outgoing",
    });
  }
  for (const r of walletTx.data ?? []) {
    const kind = String(r.kind || "wallet_movement");
    pushPayment({
      source: "wallet_tx",
      id: String(r.id),
      amount: r.amount,
      currency: "ETB",
      status: "posted",
      purpose: r.note || kind,
      module: "wallet",
      provider: "wallet",
      provider_ref: r.tx_ref,
      payer_id: r.is_credit ? null : r.user_id,
      beneficiary_id: r.is_credit ? r.user_id : null,
      created_at: r.created_at,
      paid_at: r.created_at,
      is_sale: false,
      tx_type:
        kind === "earning"
          ? "provider_earning"
          : kind === "refund"
            ? "refund"
            : kind.includes("withdraw")
              ? "withdrawal"
              : "wallet_movement",
      direction: r.is_credit ? "incoming" : "outgoing",
      net: kind === "earning" && r.is_credit ? r.amount : null,
    });
  }
  for (const r of coinTx.data ?? []) {
    pushPayment({
      source: "coin_tx",
      id: String(r.id),
      amount: r.amount,
      currency: "COIN",
      status: String(r.status || "posted"),
      purpose: r.note || r.kind || "Coin movement",
      module: "coins",
      provider: "coins",
      payer_id: r.is_credit ? r.counterparty_id : r.user_id,
      beneficiary_id: r.is_credit ? r.user_id : r.counterparty_id,
      created_at: r.created_at,
      paid_at: r.created_at,
      is_sale: false,
      tx_type: String(r.kind || "coin_movement"),
      direction: r.is_credit ? "incoming" : "outgoing",
      asset_class: "coin",
    });
  }

  const people = await userMap(
    client,
    rows.flatMap((r) => [r.payer?.id, r.beneficiary?.id].filter(Boolean) as string[]),
  );
  for (const r of rows) {
    if (r.payer?.id && people[r.payer.id]) r.payer = people[r.payer.id];
    if (r.beneficiary?.id && people[r.beneficiary.id]) r.beneficiary = people[r.beneficiary.id];
  }

  let filtered = rows;
  if (params.asset_class === "money" || params.asset_class === "coin") {
    filtered = filtered.filter((r) => r.asset_class === params.asset_class);
  }
  if (params.module) filtered = filtered.filter((r) => r.module === params.module);
  if (params.status) filtered = filtered.filter((r) => r.status_group === params.status);
  if (params.tx_type) filtered = filtered.filter((r) => r.tx_type === params.tx_type);
  if (params.provider) filtered = filtered.filter((r) => r.payment_provider === params.provider);
  if (params.q?.trim()) {
    const q = params.q.trim().toLowerCase();
    filtered = filtered.filter((r) =>
      [r.purpose, r.provider_ref, r.payer?.display_name, r.payer?.email, r.id, r.beneficiary?.display_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }

  filtered.sort((a, b) => String(b.occurred_at || "").localeCompare(String(a.occurred_at || "")));
  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  const data = filtered.slice(offset, offset + pageSize);

  return {
    data,
    total,
    page,
    page_size: pageSize,
    window: { start, end },
    source: "admin_local_fallback",
  };
}

export async function summaryTransactionsLocal(range = "30d") {
  const list = await listTransactionsLocal({ range, page: 1, page_size: 100, asset_class: null });
  // Pull a larger set for summary by paging
  const all: TxOut[] = [...list.data];
  const pages = Math.min(Math.ceil(list.total / 100), 20);
  for (let p = 2; p <= pages; p++) {
    const more = await listTransactionsLocal({ range, page: p, page_size: 100 });
    all.push(...more.data);
  }

  const byCurrency: Record<
    string,
    {
      currency: string;
      verified_customer_payments: number;
      platform_commission_earned: number;
      provider_earnings: number;
      refunds: number;
      completed_payouts: number;
      pending_withdrawals: number;
      coin_credits: number;
      coin_debits: number;
    }
  > = {};

  const ensure = (c: string) => {
    if (!byCurrency[c]) {
      byCurrency[c] = {
        currency: c,
        verified_customer_payments: 0,
        platform_commission_earned: 0,
        provider_earnings: 0,
        refunds: 0,
        completed_payouts: 0,
        pending_withdrawals: 0,
        coin_credits: 0,
        coin_debits: 0,
      };
    }
    return byCurrency[c];
  };

  for (const r of all) {
    const bucket = ensure(r.currency);
    const amt = Number(r.amount) || 0;
    if (r.asset_class === "coin") {
      if (r.direction === "incoming") bucket.coin_credits += amt;
      else bucket.coin_debits += amt;
      continue;
    }
    if (r.is_sale && r.status_group === "verified") bucket.verified_customer_payments += amt;
    if (r.platform_commission && r.status_group === "verified") {
      bucket.platform_commission_earned += Number(r.platform_commission) || 0;
    }
    if (r.recipient_net && (r.status_group === "verified" || r.status_group === "posted")) {
      bucket.provider_earnings += Number(r.recipient_net) || 0;
    }
    if (r.status_group === "refunded" || r.tx_type === "refund") bucket.refunds += amt;
    if (
      (r.source === "withdrawal" || r.source === "coin_redemption") &&
      r.status_group === "paid"
    ) {
      bucket.completed_payouts += amt;
    }
    if (
      (r.source === "withdrawal" || r.source === "coin_redemption") &&
      r.status_group === "pending"
    ) {
      bucket.pending_withdrawals += amt;
    }
  }

  const dayMap: Record<string, { day: string; currency: string; verified_payments: number; commission: number }> =
    {};
  for (const r of all) {
    if (r.asset_class !== "money" || !r.is_sale || r.status_group !== "verified") continue;
    const day = (r.occurred_at || "").slice(0, 10);
    if (!day) continue;
    const key = `${day}:${r.currency}`;
    if (!dayMap[key]) {
      dayMap[key] = { day, currency: r.currency, verified_payments: 0, commission: 0 };
    }
    dayMap[key].verified_payments += Number(r.amount) || 0;
    dayMap[key].commission += Number(r.platform_commission) || 0;
  }

  return {
    window: list.window,
    by_currency: Object.values(byCurrency).map((b) => ({
      currency: b.currency,
      verified_customer_payments: money(b.verified_customer_payments),
      platform_commission_earned: money(b.platform_commission_earned),
      provider_earnings: money(b.provider_earnings),
      refunds: money(b.refunds),
      completed_payouts: money(b.completed_payouts),
      pending_withdrawals: money(b.pending_withdrawals),
      coin_credits: b.currency === "COIN" ? money(b.coin_credits) : null,
      coin_debits: b.currency === "COIN" ? money(b.coin_debits) : null,
    })),
    trends: Object.values(dayMap)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((t) => ({
        day: t.day,
        currency: t.currency,
        verified_payments: money(t.verified_payments),
        commission: money(t.commission),
      })),
    notes: [
      "Loaded via admin local fallback (Python finance API unavailable or not yet deployed).",
      "Verified customer payments exclude wallet credits and payouts.",
    ],
    gaps: [
      "Local fallback uses capped per-table fetches (500). Prefer Python aggregation once deployed.",
    ],
    source: "admin_local_fallback",
  };
}
