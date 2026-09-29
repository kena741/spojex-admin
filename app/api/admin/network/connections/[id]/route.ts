import { NextResponse } from "next/server";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("network:write");
  if (!auth.ok) return auth.error;

  const { id } = await params;
  const client = auth.context.client;

  const { data: existing, error: loadError } = await client
    .from("connections")
    .select("id, user_a, user_b")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${loadError.message}. ${hint}` : loadError.message },
      { status: 400 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const { error: deleteError } = await client.from("connections").delete().eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "network.remove_connection",
    resource_type: "connection",
    resource_id: id,
    summary: `Removed connection between ${existing.user_a.slice(0, 8)} and ${existing.user_b.slice(0, 8)}`,
    metadata: { user_a: existing.user_a, user_b: existing.user_b },
  });

  return NextResponse.json({ ok: true });
}
