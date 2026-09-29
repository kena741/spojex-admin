import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("requests:write");
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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const payload = (data ?? {}) as { ok?: boolean; error?: string; status?: string };
  if (payload.ok !== true) {
    return NextResponse.json(
      { error: payload.error || "Could not update this withdrawal." },
      { status: 400 },
    );
  }
  return NextResponse.json({ data: payload });
}
