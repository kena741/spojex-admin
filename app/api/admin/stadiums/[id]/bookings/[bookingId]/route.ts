import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

const TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "completed", "cancelled", "canceled"],
  confirmed: ["checked_in", "completed", "cancelled", "canceled"],
  checked_in: ["completed", "cancelled", "canceled"],
  active: ["completed", "cancelled", "canceled"],
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; bookingId: string }> },
) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;
  const { id, bookingId } = await params;
  const body = (await request.json()) as {
    status?: string;
    reason?: string;
    expected_updated_at?: string;
  };

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/stadiums/${id}/bookings/${bookingId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      if (res.status >= 400 && res.status < 500) {
        const detail =
          (payload as { detail?: { message?: string } }).detail?.message ||
          (payload as { error?: string }).error ||
          (payload as { message?: string }).message ||
          "Update failed";
        return NextResponse.json({ error: detail }, { status: res.status });
      }
    } catch {
      // local fallback
    }
  }

  let next = String(body.status || "")
    .trim()
    .toLowerCase();
  if (next === "canceled") next = "cancelled";
  if (!next) {
    return NextResponse.json({ error: "Status is required" }, { status: 400 });
  }

  const { data: existing, error: loadError } = await auth.context.client
    .from("stadium_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("stadium_id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const current = String(existing.status || "").toLowerCase();
  const allowed = TRANSITIONS[current] ?? [];
  if (!allowed.includes(next) && !(next === "cancelled" && allowed.includes("canceled"))) {
    return NextResponse.json(
      { error: `Cannot change booking from ${current} to ${next}` },
      { status: 400 },
    );
  }
  if (next === "cancelled" && !String(body.reason || "").trim()) {
    return NextResponse.json({ error: "Reason is required to cancel a booking" }, { status: 400 });
  }

  if (body.expected_updated_at && existing.updated_at) {
    if (String(existing.updated_at).slice(0, 19) !== body.expected_updated_at.slice(0, 19)) {
      return NextResponse.json(
        { error: "Booking was updated elsewhere. Refresh and try again.", code: "conflict" },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  const reason = String(body.reason || "").trim();
  const prevNotes = String(existing.notes || "").trim();
  const stamp = reason ? `[admin:${next}] ${reason}` : "";
  const patch: Record<string, unknown> = {
    status: next,
    updated_at: now,
  };
  if (stamp) {
    patch.notes = prevNotes ? `${prevNotes}\n${stamp}` : stamp;
  }
  if (next === "checked_in" && !existing.checked_in_at) patch.checked_in_at = now;
  if (next === "completed" && !existing.checked_out_at) patch.checked_out_at = now;

  const { data, error } = await auth.context.client
    .from("stadium_bookings")
    .update(patch)
    .eq("id", bookingId)
    .eq("stadium_id", id)
    .select()
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "stadium_booking.status",
    resource_type: "stadium_booking",
    resource_id: bookingId,
    summary: `Stadium booking ${current} → ${next}`,
    metadata: { from: current, status: next, reason: reason || null, stadium_id: id },
  });

  return NextResponse.json({
    ok: true,
    id: bookingId,
    from: current,
    status: next,
    data,
    source: "local",
  });
}
