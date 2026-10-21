import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ txId: string[] }> };

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

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireAnyAdminPermission(["finance:read", "wallets:read", "payments:read"]);
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { txId } = await ctx.params;
  const id = (txId ?? []).map(decodeURIComponent).join("/");
  if (!id) return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });

  const target = `${getSpojexApiBaseUrl()}/api/v1/admin/finance/transactions/${encodeURIComponent(id)}`;
  const res = await fetch(target, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return NextResponse.json(
      { error: backendError(payload, "Failed to load transaction") },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}
