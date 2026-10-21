import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ type: string; id: string }> };

function backendError(payload: Record<string, unknown>, fallback: string) {
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  return fallback;
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.error;

  const { type, id } = await ctx.params;
  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const base = getSpojexApiBaseUrl();
  const res = await fetch(
    `${base}/api/v1/admin/analytics/content/${encodeURIComponent(type)}/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return NextResponse.json(
      { error: backendError(payload, "Could not load content analytics") },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}
