import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { backendError } from "@/lib/backend-error";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

/**
 * Wallet withdrawal requests with the owner's details and live wallet
 * balance (available, withdrawable, held), via Spojex REST.
 */
export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission([
    "withdrawals:read",
    "requests:read",
  ]);
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const qs = new URLSearchParams({
    limit: url.searchParams.get("limit") || "300",
  });
  const status = url.searchParams.get("status");
  if (status && status !== "all") qs.set("status", status);

  const res = await fetch(
    `${getSpojexApiBaseUrl()}/api/v1/admin/wallet/withdrawals?${qs.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  const payload = (await res.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!res.ok) {
    return NextResponse.json(
      { error: backendError(payload, "Failed to load withdrawals") },
      { status: res.status },
    );
  }
  return NextResponse.json({
    data: Array.isArray(payload.data) ? payload.data : [],
    count: payload.count ?? 0,
  });
}
