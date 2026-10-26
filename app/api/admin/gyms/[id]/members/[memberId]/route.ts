import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id: gymId, memberId } = await params;
  const body = (await request.json()) as { is_active?: boolean };

  if (typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "is_active boolean is required" }, { status: 400 });
  }

  const { data, error } = await auth.context.client
    .from("gym_members")
    .update({ is_active: body.is_active })
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .select("*, users:user_id(id, display_name, email, role, phone)")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id: gymId, memberId } = await params;
  const client = auth.context.client;

  const { data: member, error: memberError } = await client
    .from("gym_members")
    .select("id, user_id, is_active")
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .maybeSingle();
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Soft-remove preserves gym_memberships / payments FKs (hard delete returns FK 400).
  if (member.user_id) {
    const { data: gym } = await client
      .from("gyms")
      .select("organization_id, owner_user_id")
      .eq("id", gymId)
      .maybeSingle();
    const orgId = gym?.organization_id as string | null | undefined;
    const stillStaff =
      gym?.owner_user_id === member.user_id
        ? true
        : Boolean(
            (
              await client
                .from("gym_staff")
                .select("id")
                .eq("gym_id", gymId)
                .eq("user_id", member.user_id)
                .eq("is_active", true)
                .maybeSingle()
            ).data,
          );
    if (orgId && !stillStaff) {
      await client
        .from("organization_members")
        .update({ status: "left" })
        .eq("organization_id", orgId)
        .eq("user_id", member.user_id)
        .neq("member_role", "owner");
      const { data: group } = await client
        .from("conversations")
        .select("id")
        .eq("organization_id", orgId)
        .eq("type", "organization")
        .eq("org_thread_kind", "group")
        .maybeSingle();
      if (group?.id) {
        await client
          .from("conversation_members")
          .delete()
          .eq("conversation_id", group.id)
          .eq("user_id", member.user_id);
      }
    }
  }

  const { data, error } = await client
    .from("gym_members")
    .update({ is_active: false })
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .select("id, is_active")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, soft_removed: true, data });
}
