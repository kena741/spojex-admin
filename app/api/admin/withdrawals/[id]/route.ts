import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { backendError } from "@/lib/backend-error";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

/** Older clients send the target status instead of an action. */
const ACTIONS: Record<string, "approve" | "paid" | "reject"> = {
  approve: "approve",
  approved: "approve",
  paid: "paid",
  mark_paid: "paid",
  reject: "reject",
  rejected: "reject",
};

/**
 * Move a withdrawal: approve (pending → approved), paid (approved → paid,
 * needs the transfer reference) or reject (held amount goes back to the
 * wallet). The backend enforces the order, permissions and self-approval.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission([
    "withdrawals:approve",
    "withdrawals:execute",
    "withdrawals:write",
    "requests:write",
  ]);
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    status?: string;
    note?: string;
    admin_note?: string;
  };
  const raw = (body.action ?? body.status ?? "").trim().toLowerCase();
  const action = ACTIONS[raw];
  if (!action) {
    return NextResponse.json(
      { error: "Use approve, paid or reject." },
      { status: 400 },
    );
  }
  const note = (body.admin_note ?? body.note ?? "").trim();

  const res = await fetch(
    `${getSpojexApiBaseUrl()}/api/v1/admin/wallet/withdrawals/${encodeURIComponent(id)}/resolve`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, admin_note: note }),
    },
  );
  const payload = (await res.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!res.ok) {
    await logAdminActivity({
      context: auth.context,
      request,
      action: "withdrawals.resolve",
      resource_type: "withdrawal_request",
      resource_id: id,
      summary: `Withdrawal ${action} failed`,
      outcome: res.status === 403 ? "denied" : "error",
      metadata: { action, status: res.status },
    });
    return NextResponse.json(
      { error: backendError(payload, "Could not update this withdrawal.") },
      { status: res.status },
    );
  }
  await logAdminActivity({
    context: auth.context,
    request,
    action: "withdrawals.resolve",
    resource_type: "withdrawal_request",
    resource_id: id,
    summary: `Withdrawal ${action}`,
    outcome: "success",
    metadata: { action, status: payload.status },
  });
  return NextResponse.json({ data: payload });
}
