import type { SpojexClient } from "@/lib/api/client";
import type { GymFinance, GymFinanceTxn } from "@/lib/gyms";

const VERIFIED = new Set(["completed", "paid", "success", "verified"]);
const REFUNDED = new Set(["refunded", "partial_refund"]);

function money(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function effectiveAt(row: { paid_at?: string | null; created_at?: string | null }) {
  return row.paid_at || row.created_at || "";
}

type PaymentRow = {
  id: string;
  amount?: number | string | null;
  currency?: string | null;
  commission_pct?: number | string | null;
  commission_amount?: number | string | null;
  gym_net_amount?: number | string | null;
  payment_type?: string | null;
  status?: string | null;
  provider_ref?: string | null;
  paid_at?: string | null;
  created_at: string;
  member_id?: string | null;
  membership_id?: string | null;
  plan_id?: string | null;
  gym_members?: { full_name?: string | null } | null;
  gym_memberships?: { purchased_plan_title?: string | null } | null;
  gym_plans?: { title?: string | null } | null;
};

/** Build gym finance payload from gym_payments when the Python API is unavailable. */
export async function getGymFinanceLocal(
  client: SpojexClient,
  gymId: string,
  days: number,
): Promise<GymFinance & { ok: true; source: "local" }> {
  const rangeDays = Math.max(1, Math.min(365, Math.floor(days) || 30));
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();

  const gymRes = await client
    .from("gyms")
    .select("id, monthly_payment, commission_pct, currency")
    .eq("id", gymId)
    .maybeSingle();
  if (gymRes.error) throw new Error(gymRes.error.message);
  if (!gymRes.data) {
    const err = new Error("Gym not found");
    (err as Error & { code?: string }).code = "not_found";
    throw err;
  }

  // Fetch a padded window by created_at, then filter on coalesce(paid_at, created_at).
  const paddedSince = new Date(
    Date.now() - (rangeDays + 7) * 24 * 60 * 60 * 1000,
  ).toISOString();

  let paymentsRes = await client
    .from("gym_payments")
    .select(
      "id, amount, currency, commission_pct, commission_amount, gym_net_amount, payment_type, status, provider_ref, paid_at, created_at, member_id, membership_id, plan_id, gym_members:member_id(full_name), gym_memberships:membership_id(purchased_plan_title), gym_plans:plan_id(title)",
    )
    .eq("gym_id", gymId)
    .gte("created_at", paddedSince)
    .order("created_at", { ascending: false })
    .limit(500);

  if (paymentsRes.error) {
    // Fallback without embeds if relationships are missing in PostgREST cache.
    paymentsRes = await client
      .from("gym_payments")
      .select(
        "id, amount, currency, commission_pct, commission_amount, gym_net_amount, payment_type, status, provider_ref, paid_at, created_at, member_id, membership_id, plan_id",
      )
      .eq("gym_id", gymId)
      .gte("created_at", paddedSince)
      .order("created_at", { ascending: false })
      .limit(500);
    if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  }

  const rows = (paymentsRes.data ?? []) as PaymentRow[];
  const inPeriod = rows.filter((row) => {
    const at = effectiveAt(row);
    return Boolean(at && at >= since);
  });

  let verifiedGross = 0;
  let platformCommission = 0;
  let gymNet = 0;
  let refundsAmount = 0;
  let verifiedCount = 0;
  let pendingCount = 0;
  const byType = new Map<
    string,
    { payment_type: string; n: number; amount: number; commission: number; gym_net: number }
  >();

  for (const row of inPeriod) {
    const status = String(row.status || "").toLowerCase();
    const amount = Number(row.amount) || 0;
    const commission = Number(row.commission_amount) || 0;
    const net = Number(row.gym_net_amount) || 0;
    if (status === "pending") pendingCount += 1;
    if (VERIFIED.has(status)) {
      verifiedGross += amount;
      platformCommission += commission;
      gymNet += net;
      verifiedCount += 1;
      const key = (row.payment_type || "").trim() || "unknown";
      const bucket = byType.get(key) || {
        payment_type: key,
        n: 0,
        amount: 0,
        commission: 0,
        gym_net: 0,
      };
      bucket.n += 1;
      bucket.amount += amount;
      bucket.commission += commission;
      bucket.gym_net += net;
      byType.set(key, bucket);
    }
    if (REFUNDED.has(status)) refundsAmount += amount;
  }

  const transactions: GymFinanceTxn[] = inPeriod.slice(0, 100).map((t) => ({
    id: String(t.id),
    amount: t.amount,
    currency: t.currency || "ETB",
    commission_amount: t.commission_amount,
    gym_net_amount: t.gym_net_amount,
    payment_type: t.payment_type,
    status: t.status,
    paid_at: t.paid_at,
    created_at: t.created_at,
    member_name: t.gym_members?.full_name || null,
    plan_title:
      t.gym_memberships?.purchased_plan_title || t.gym_plans?.title || null,
    member_id: t.member_id || null,
    finance_href: `/admin/finance/transactions?module=gym&q=${t.id}`,
    member_href: t.member_id
      ? `/admin/gyms/${gymId}?tab=members&member=${t.member_id}`
      : null,
  }));

  return {
    ok: true,
    source: "local",
    period: {
      days: rangeDays,
      timezone: "Africa/Addis_Ababa",
      label: `Last ${rangeDays} days`,
    },
    customer_collections: {
      verified_gross: money(verifiedGross),
      platform_commission: money(platformCommission),
      gym_net_earnings: money(gymNet),
      refunds_amount: money(refundsAmount),
      verified_count: verifiedCount,
      pending_count: pendingCount,
      currency: "ETB",
      note:
        "Sums use commission_amount / gym_net_amount recorded on each payment (historical snapshot). Local fallback — Python finance API was unavailable.",
    },
    by_payment_type: [...byType.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((b) => ({
        payment_type: b.payment_type,
        n: b.n,
        amount: money(b.amount),
        commission: money(b.commission),
        gym_net: money(b.gym_net),
      })),
    platform_subscription_fee: {
      configured_monthly: money(gymRes.data.monthly_payment),
      currency: "ETB",
      invoice_history_available: false,
      note: "Distinct from customer membership collections. Invoice ledger unavailable.",
    },
    settlement: { available: false, note: "Settlement balances not implemented." },
    payouts: { available: false, note: "Payout ledger not implemented." },
    transactions,
    exclusions: [
      "Owner personal wallet activity is not included.",
      "Current plan prices × member counts are not used as revenue.",
      "Coins are not mixed into ETB totals.",
    ],
  };
}
