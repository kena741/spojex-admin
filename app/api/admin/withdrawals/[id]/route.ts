import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission([
    "withdrawals:execute",
    "withdrawals:approve",
    "withdrawals:write",
  ]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as { action?: string; note?: string };
  const action = (body.action ?? "").trim().toLowerCase();
  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }
  const { data, error } = await auth.context.client.rpc("resolve_wallet_withdrawal", {
    p_id: id,
    p_action: action,
    p_note: body.note ?? "",
  });
  if (error) {
    await logAdminActivity({
      context: auth.context,
      request,
      action: "withdrawals.resolve",
      resource_type: "withdrawal_request",
      resource_id: id,
      summary: `Withdrawal resolve failed (${action})`,
      outcome: "error",
      metadata: { action, error: error.message },
    });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const payload = (data ?? {}) as { ok?: boolean; error?: string; status?: string };
  if (payload.ok !== true) {
    await logAdminActivity({
      context: auth.context,
      request,
      action: "withdrawals.resolve",
      resource_type: "withdrawal_request",
      resource_id: id,
      summary: `Withdrawal resolve rejected (${action})`,
      outcome: "denied",
      metadata: { action, error: payload.error },
    });
    return NextResponse.json(
      { error: payload.error || "Could not update this withdrawal." },
      { status: 400 },
    );
  }
  await logAdminActivity({
    context: auth.context,
    request,
    action: "withdrawals.resolve",
    resource_type: "withdrawal_request",
    resource_id: id,
    summary: `Resolved withdrawal as ${action}`,
    outcome: "success",
    metadata: { action, status: payload.status },
  });
  return NextResponse.json({ data: payload });
}
