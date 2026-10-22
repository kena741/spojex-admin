import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyRadioChat } from "@/lib/radio-chat-api";

export const dynamic = "force-dynamic";

/** Legacy hide endpoint - prefer /messages/[id]/actions. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission(["streams:write", "reports:write"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
  };
  const action = body.action === "restore" ? "restore" : "hide";
  if (action === "hide" && body.action && body.action !== "hide") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }
  return proxyRadioChat(`/messages/${id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action,
      reason: body.reason || (action === "hide" ? "Hidden by moderator" : "Restored by moderator"),
    }),
  });
}
