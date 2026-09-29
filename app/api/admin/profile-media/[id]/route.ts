import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("users:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data: row, error: loadError } = await auth.context.client
    .from("profile_media")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!row) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  const { error: deleteError } = await auth.context.client.from("profile_media").delete().eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  const path = typeof row.storage_path === "string" ? row.storage_path.trim() : "";
  if (path) {
    await auth.context.client.storage.from("profile-media").remove([path]);
  }

  return NextResponse.json({ ok: true });
}
