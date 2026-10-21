import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; ticketId: string }> },
) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, ticketId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    override_reason?: string;
  };

  const res = await fetch(`${getSpojexApiBaseUrl()}/api/v1/admin/events/${id}/scan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: body.action,
      ticket_id: ticketId,
      override_reason: body.override_reason ?? null,
    }),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      {
        error:
          (payload as { message?: string; error?: string }).message ||
          (payload as { error?: string }).error ||
          "Scan failed",
      },
      { status: res.status },
    );
  }

  // Refresh full ticket row for UI (code still available server-side; UI conceals).
  const refreshed = await auth.context.client
    .from("event_tickets")
    .select("*, users:user_id(id, display_name, email, phone)")
    .eq("id", ticketId)
    .eq("event_id", id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    ...(payload as object),
    data: refreshed.data,
  });
}
