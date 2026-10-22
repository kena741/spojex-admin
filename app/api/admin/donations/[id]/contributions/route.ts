import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("donations:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const incoming = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of ["q", "status", "page", "page_size"]) {
    const value = incoming.searchParams.get(key);
    if (value) qs.set(key, value);
  }

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/donations/${id}/contributions?${qs}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
    } catch {
      // fall through
    }
  }

  const page = Math.max(1, Number(qs.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(qs.get("page_size") || 40) || 40));
  const status = (qs.get("status") || "all").toLowerCase();
  const q = (qs.get("q") || "").trim().toLowerCase();

  let query = auth.context.client
    .from("donation_contributions")
    .select("*, users:user_id(id, display_name, email)", { count: "exact" })
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status !== "all") query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let rows = (data ?? []) as Record<string, unknown>[];
  if (q) {
    rows = rows.filter((row) => {
      const users = row.users as { display_name?: string } | null;
      const hay = [
        row.provider_ref,
        row.message,
        users?.display_name,
        row.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const mapped = rows.map((row) => {
    const currency = String(row.currency || "").toUpperCase();
    const ref = String(row.provider_ref || "");
    const isCoin = currency === "COIN" || currency === "COINS" || ref.startsWith("coin:");
    const anonymous = Boolean(row.is_anonymous);
    return {
      ...row,
      donor_display_name: anonymous
        ? "Anonymous"
        : (row.users as { display_name?: string } | null)?.display_name || "Donor",
      user_id: anonymous ? null : row.user_id,
      payment_source: {
        method: isCoin ? "coin_wallet" : "chapa",
        label: isCoin ? "Coin wallet" : "Chapa (ETB)",
        reference: ref || "—",
      },
      transaction_reference: ref || "—",
      finance_href: `/admin/finance/transactions?module=donations&q=${row.id}`,
    };
  });

  return NextResponse.json({
    data: mapped,
    total: count ?? mapped.length,
    page,
    page_size: pageSize,
    source: "local",
  });
}
