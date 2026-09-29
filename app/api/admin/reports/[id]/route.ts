import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("reports:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const { error: deleteError } = await auth.context.client.from("reports").delete().eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
