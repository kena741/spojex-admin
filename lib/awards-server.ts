import "server-only";

import { NextResponse } from "next/server";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

function errorMessage(payload: Record<string, unknown>, fallback: string) {
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const message = (detail as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  return fallback;
}

/** Server-side: forward to /api/v1/admin/awards/… on Spojex REST. */
export async function proxyAwards(path: string, method: string, search: string, body?: unknown) {
  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await fetch(`${getSpojexApiBaseUrl()}/api/v1/admin/awards/${path}${search}`, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return NextResponse.json(
      { error: errorMessage(payload, "Awards request failed") },
      { status: res.status },
    );
  }
  return NextResponse.json({ data: payload });
}
