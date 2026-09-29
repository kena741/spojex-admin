import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission([
    "donations:write",
    "requests:write",
  ]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as { action?: string; admin_note?: string };
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (action !== "paid" && action !== "rejected") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const { data, error } = await auth.context.client.rpc("resolve_coin_redemption", {
    p_id: id,
    p_action: action,
    p_admin_note: typeof body.admin_note === "string" ? body.admin_note : "",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}
