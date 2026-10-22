import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { getGymFinanceLocal } from "@/lib/gym-finance-local";
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const daysRaw = new URL(request.url).searchParams.get("days") || "30";
  const days = Math.max(1, Math.min(365, Number(daysRaw) || 30));

  let upstreamMessage: string | null = null;
  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/gyms/${id}/finance?days=${encodeURIComponent(String(days))}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        return NextResponse.json({ ...payload, source: "python" });
      }
      upstreamMessage = backendError(payload, `Finance API returned ${res.status}`);
      // Gym missing → surface immediately (don't invent local data for wrong id)
      if (res.status === 404) {
        return NextResponse.json(
          { error: upstreamMessage, code: "not_found" },
          { status: 404 },
        );
      }
      if (res.status === 403) {
        return NextResponse.json(
          { error: upstreamMessage, code: "permission_denied" },
          { status: 403 },
        );
      }
    } catch (err) {
      upstreamMessage =
        err instanceof Error ? err.message : "Could not reach the Python finance API";
    }
  } else {
    upstreamMessage = "No access token available for the Python finance API";
  }

  try {
    const local = await getGymFinanceLocal(auth.context.client, id, days);
    return NextResponse.json({
      ...local,
      upstream_warning: upstreamMessage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load gym finance";
    const code = (err as { code?: string }).code;
    if (code === "not_found") {
      return NextResponse.json({ error: message, code }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: upstreamMessage
          ? `${upstreamMessage}. Local fallback also failed: ${message}`
          : message,
        code: "api_error",
        settlement: { available: false },
        payouts: { available: false },
      },
      { status: 503 },
    );
  }
}
