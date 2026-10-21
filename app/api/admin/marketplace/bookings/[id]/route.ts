import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

const ALLOWED: Record<string, string[]> = {
  pending: ["accepted", "declined", "cancelled"],
  awaiting_payment: ["accepted", "cancelled", "declined"],
  accepted: ["completed", "cancelled"],
  declined: [],
  completed: [],
  cancelled: [],
  canceled: [],
};

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdminPermission("requests:write");
  if (!auth.ok) return auth.error;
  const { id } = await ctx.params;
  const body = (await request.json()) as {
    status?: string;
    reason?: string;
    expected_updated_at?: string;
  };
  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/marketplace/bookings/${id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json(payload);
      if (res.status !== 404) {
        const detail =
          typeof (payload as { detail?: unknown }).detail === "string"
            ? (payload as { detail: string }).detail
            : (payload as { error?: string }).error || "Update failed";
        return NextResponse.json({ error: detail }, { status: res.status });
      }
    } catch {
      // local fallback
    }
  }

  const { data: current, error: loadError } = await auth.context.client
    .from("service_requests")
    .select("id, status, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const allowed = ALLOWED[String(current.status).toLowerCase()] ?? [];
  if (!allowed.includes(body.status)) {
    return NextResponse.json(
      { error: `Cannot transition from ${current.status} to ${body.status}` },
      { status: 400 },
    );
  }
  if (["declined", "cancelled", "canceled"].includes(body.status) && !body.reason?.trim()) {
    return NextResponse.json({ error: "A reason is required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    status: body.status,
    updated_at: new Date().toISOString(),
  };
  if (body.status === "completed") {
    patch.completed_at = new Date().toISOString();
  }

  const { data, error } = await auth.context.client
    .from("service_requests")
    .update(patch)
    .eq("id", id)
    .eq("status", current.status)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) {
    return NextResponse.json(
      { error: "Booking was updated by someone else. Refresh and try again." },
      { status: 409 },
    );
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "update",
    resource_type: "service_request",
    resource_id: id,
    summary: `Booking ${current.status} → ${body.status}`,
    metadata: { from: current.status, to: body.status, reason: body.reason ?? null },
  });

  return NextResponse.json({
    ok: true,
    data,
    allowed_transitions: ALLOWED[body.status] ?? [],
  });
}
