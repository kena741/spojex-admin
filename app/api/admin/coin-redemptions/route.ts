import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

function backendError(payload: Record<string, unknown>, fallback: string) {
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const nested = detail as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message;
    }
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  return fallback;
}

/** List coin redemption / withdraw requests via Spojex REST. */
export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission([
    "donations:read",
    "requests:read",
  ]);
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = url.searchParams.get("limit") || "200";
  const qs = new URLSearchParams({ limit });
  if (status && status !== "all") qs.set("status", status);

  const base = getSpojexApiBaseUrl();
  const res = await fetch(
    `${base}/api/v1/admin/coins/redemptions?${qs.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return NextResponse.json(
      { error: backendError(payload, "Failed to load redemptions") },
      { status: res.status },
    );
  }
  return NextResponse.json({
    data: Array.isArray(payload.data) ? payload.data : [],
    count: payload.count ?? 0,
  });
}
