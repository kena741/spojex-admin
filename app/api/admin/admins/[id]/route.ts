import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("admins:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as {
    full_name?: string;
    role?: string;
    is_active?: boolean;
    email?: string;
  };
  const patch: Record<string, unknown> = {};
  if (typeof body.full_name === "string") patch.full_name = body.full_name.trim();
  if (typeof body.role === "string") patch.role = body.role.trim();
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.email === "string") patch.email = body.email.trim().toLowerCase();

  const { data, error } = await auth.context.client
    .from("admin")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("admins:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  if (id === auth.context.staff.id) {
    return NextResponse.json({ error: "You cannot delete your own admin row" }, { status: 400 });
  }
  const { error } = await auth.context.client.from("admin").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
