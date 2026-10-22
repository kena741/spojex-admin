import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

/**
 * List recent in-app notifications - proxies to Spojex REST
 * `GET /api/v1/push/admin/notifications`.
 */
export async function GET() {
  const auth = await requireAdminPermission("notifications:read");
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = getSpojexApiBaseUrl();
  const res = await fetch(`${base}/api/v1/push/admin/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (typeof payload.detail === "string" && payload.detail) ||
      (typeof payload.error === "string" && payload.error) ||
      "Failed to load notifications";
    return NextResponse.json({ error: message }, { status: res.status });
  }
  return NextResponse.json(payload);
}
