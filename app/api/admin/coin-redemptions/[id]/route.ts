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

/** Mark a redemption paid or rejected (restores coins on reject). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission([
    "donations:write",
    "requests:write",
  ]);
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as { action?: string; admin_note?: string };
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (action !== "paid" && action !== "rejected") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const base = getSpojexApiBaseUrl();
  const res = await fetch(
    `${base}/api/v1/admin/coins/redemptions/${id}/resolve`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        admin_note: typeof body.admin_note === "string" ? body.admin_note : "",
      }),
    },
  );
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return NextResponse.json(
      { error: backendError(payload, "Update failed") },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}
