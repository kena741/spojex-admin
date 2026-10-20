import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { gymStaffRoles, type GymStaffRole } from "@/lib/gyms";

const allowedRoles = new Set(gymStaffRoles.map((item) => item.id));

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; staffId: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id: gymId, staffId } = await params;
  const body = (await request.json()) as {
    staff_role?: string;
    is_active?: boolean;
  };

  const patch: Record<string, unknown> = {};
  if (typeof body.staff_role === "string") {
    if (!allowedRoles.has(body.staff_role as GymStaffRole)) {
      return NextResponse.json({ error: "Invalid staff_role" }, { status: 400 });
    }
    patch.staff_role = body.staff_role;
    // Assigned owners must keep full defaults (videos.upload); drop stale overrides.
    if (body.staff_role === "owner") {
      patch.permissions = {};
    }
  }
  if (typeof body.is_active === "boolean") {
    patch.is_active = body.is_active;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data, error } = await auth.context.client
    .from("gym_staff")
    .update(patch)
    .eq("id", staffId)
    .eq("gym_id", gymId)
    .select("*, users:user_id(id, display_name, email, role, phone)")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  if (patch.staff_role === "owner" && data.user_id) {
    await auth.context.client
      .from("gyms")
      .update({
        owner_user_id: data.user_id,
        owner_name:
          (data.users as { display_name?: string | null; email?: string | null } | null)
            ?.display_name ||
          (data.users as { email?: string | null } | null)?.email ||
          "",
      })
      .eq("id", gymId);
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; staffId: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id: gymId, staffId } = await params;

  const { error } = await auth.context.client
    .from("gym_staff")
    .delete()
    .eq("id", staffId)
    .eq("gym_id", gymId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
