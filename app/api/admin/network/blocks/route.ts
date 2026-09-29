import { NextResponse } from "next/server";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function DELETE(request: Request) {
  const auth = await requireAdminPermission("network:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    blocker_id?: string;
    blocked_id?: string;
  };
  if (!body.blocker_id || !body.blocked_id) {
    return NextResponse.json(
      { error: "blocker_id and blocked_id are required" },
      { status: 400 },
    );
  }

  const { error } = await auth.context.client
    .from("blocks")
    .delete()
    .eq("blocker_id", body.blocker_id)
    .eq("blocked_id", body.blocked_id);

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "network.remove_block",
    resource_type: "block",
    resource_id: `${body.blocker_id}:${body.blocked_id}`,
    summary: `Removed block ${body.blocker_id.slice(0, 8)} → ${body.blocked_id.slice(0, 8)}`,
    metadata: body,
  });

  return NextResponse.json({ ok: true });
}
