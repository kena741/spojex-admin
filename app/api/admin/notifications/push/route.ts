import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

/**
 * Broadcast push - proxies to Spojex REST
 * `POST /api/v1/push/admin/broadcast`.
 */
export async function POST(request: Request) {
  const auth = await requireAdminPermission("notifications:write");
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const base = getSpojexApiBaseUrl();
  const res = await fetch(`${base}/api/v1/push/admin/broadcast`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(raw),
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = payload.detail;
    const message =
      (typeof detail === "string" && detail) ||
      (typeof payload.error === "string" && payload.error) ||
      (typeof payload.message === "string" && payload.message) ||
      "Could not send broadcast";
    return NextResponse.json({ error: message }, { status: res.status });
  }
  return NextResponse.json(payload);
}
