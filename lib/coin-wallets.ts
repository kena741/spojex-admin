import { getSpojexClient } from "@/lib/spojex/client";
import type { CoinWalletRow } from "@/lib/types";

/** Batch-load coin wallets keyed by football user id. */
export async function loadCoinWalletsByUserIds(
  userIds: string[],
): Promise<Record<string, CoinWalletRow>> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const { data, error } = await getSpojexClient()
    .from("coin_wallets")
    .select(
      "user_id, purchased_balance, received_balance, redeemable_balance, lifetime_purchased, lifetime_received, lifetime_gifted, updated_at",
    )
    .in("user_id", ids);

  if (error) {
    // Table missing or RLS - treat as empty rather than breaking the page.
    console.warn("coin_wallets load failed", error.message);
    return {};
  }

  const map: Record<string, CoinWalletRow> = {};
  for (const row of (data ?? []) as CoinWalletRow[]) {
    if (row?.user_id) map[row.user_id] = row;
  }
  return map;
}

/**
 * Sum coins gifted on live events hosted by each organization.
 * Returns orgId → total coins.
 */
export async function loadOrgLiveGiftTotals(
  orgIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(orgIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const { data: events, error: eventsError } = await getSpojexClient()
    .from("live_events")
    .select("id, host_org_id")
    .in("host_org_id", ids);

  if (eventsError || !events?.length) {
    if (eventsError) console.warn("live_events load failed", eventsError.message);
    return {};
  }

  const eventToOrg = new Map<string, string>();
  for (const row of events as { id: string; host_org_id: string }[]) {
    if (row.id && row.host_org_id) eventToOrg.set(row.id, row.host_org_id);
  }
  const eventIds = [...eventToOrg.keys()];
  if (eventIds.length === 0) return {};

  const { data: gifts, error: giftsError } = await getSpojexClient()
    .from("live_event_gifts")
    .select("event_id, coins")
    .in("event_id", eventIds);

  if (giftsError) {
    console.warn("live_event_gifts load failed", giftsError.message);
    return {};
  }

  const totals: Record<string, number> = {};
  for (const gift of (gifts ?? []) as { event_id: string; coins: number }[]) {
    const orgId = eventToOrg.get(gift.event_id);
    if (!orgId) continue;
    totals[orgId] = (totals[orgId] ?? 0) + (Number(gift.coins) || 0);
  }
  return totals;
}
