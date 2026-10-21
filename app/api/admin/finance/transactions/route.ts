import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { listTransactionsLocal } from "@/lib/finance-transactions-local";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

function backendError(payload: Record<string, unknown>, fallback: string) {
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const nested = detail as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
  }
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  return fallback;
}

function shouldFallback(status: number, message: string) {
  if (status === 404) return true;
  const m = message.toLowerCase();
  return m.includes("couldn't find") || m.includes("not found") || m.includes("not_found");
}

/** Proxy filtered transaction history; fall back to local aggregation if Python API is missing. */
export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission(["finance:read", "wallets:read", "payments:read"]);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const qp = url.searchParams;

  const token = await requestAccessToken();
  if (token) {
    try {
      const target = `${getSpojexApiBaseUrl()}/api/v1/admin/finance/transactions?${qp}`;
      const res = await fetch(target, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        return NextResponse.json({ ...payload, source: "python" });
      }
      const message = backendError(payload, "Failed to load transactions");
      if (!shouldFallback(res.status, message)) {
        return NextResponse.json({ error: message, code: res.status === 403 ? "permission_denied" : "api_error" }, { status: res.status });
      }
    } catch {
      // fall through to local
    }
  }

  try {
    const local = await listTransactionsLocal({
      range: qp.get("range") || "30d",
      asset_class: qp.get("asset_class"),
      module: qp.get("module"),
      status: qp.get("status"),
      tx_type: qp.get("tx_type"),
      provider: qp.get("provider"),
      q: qp.get("q"),
      page: Number(qp.get("page") || 1) || 1,
      page_size: Number(qp.get("page_size") || 40) || 40,
    });
    return NextResponse.json(local);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load transactions",
        code: "api_error",
      },
      { status: 500 },
    );
  }
}
