import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";

type Ctx = { params: Promise<{ userId: string }> };

/** Wallet detail + chronological ledger for a provider. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireAnyAdminPermission(["wallets:read", "requests:read", "finance:read"]);
  if (!auth.ok) return auth.error;

  const { userId } = await ctx.params;
  const client = auth.context.client;

  const [walletRes, userRes, ledgerRes, pendingWd, withdrawals] = await Promise.all([
    client.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
    client
      .from("users")
      .select("id, display_name, full_name, email, role, avatar_url")
      .eq("id", userId)
      .maybeSingle(),
    client
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    client
      .from("withdrawal_requests")
      .select("id, amount, status, created_at")
      .eq("user_id", userId)
      .eq("status", "pending"),
    client
      .from("withdrawal_requests")
      .select("id, amount, status, created_at, updated_at, admin_note")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (walletRes.error) {
    return NextResponse.json({ error: walletRes.error.message }, { status: 400 });
  }
  if (!walletRes.data) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const pendingReserved = (pendingWd.data ?? []).reduce(
    (sum: number, row: { amount?: number | string | null }) => sum + Number(row.amount || 0),
    0,
  );
  const available = Number(walletRes.data.available || 0);
  const lifetime = Number(walletRes.data.lifetime_earned || 0);

  const notes: string[] = [];
  if (available > lifetime) {
    notes.push(
      "Available balance is above lifetime earnings. This can be explained by opening balances, adjustments, or credits not counted in lifetime_earned — check ledger kinds.",
    );
  }
  notes.push(
    "Lifetime earned is the sum of earning credits recorded for this wallet; it is not recalculated from payments on this request.",
  );

  return NextResponse.json({
    wallet: walletRes.data,
    user: userRes.data ?? null,
    reserved_pending_withdrawals: pendingReserved,
    ledger: ledgerRes.data ?? [],
    ledger_error: ledgerRes.error?.message ?? null,
    withdrawals: withdrawals.data ?? [],
    notes,
    definitions: {
      available: "Funds currently withdrawable (after reserved pending payouts).",
      reserved: "Sum of pending withdrawal request amounts for this user.",
      lifetime_earned: "Documented cumulative earning credits stored on the wallet row.",
    },
  });
}
