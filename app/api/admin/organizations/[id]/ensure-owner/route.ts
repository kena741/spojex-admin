import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";

/**
 * Ensure the organization has a canonical owner_user_id that exists in `users`
 * and a matching organization_members row with member_role=owner.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) {
    auth = await requireAdminPermission("organizations:read");
  }
  if (!auth.ok) return auth.error;

  const client = auth.context.client;
  const { id } = await params;

  const { data: org, error: orgError } = await client
    .from("organizations")
    .select("id, name, user_id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 400 });
  }
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const ownerId = String(org.user_id || "").trim();
  if (!ownerId) {
    return NextResponse.json(
      {
        error: "Organization has no owner user. Reassign ownership to a Spojex user.",
        code: "missing_owner",
        owner: null,
      },
      { status: 400 },
    );
  }

  const { data: user, error: userError } = await client
    .from("users")
    .select("id, display_name, email, username, role, avatar_url")
    .eq("id", ownerId)
    .maybeSingle();
  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 400 });
  }
  if (!user?.id) {
    return NextResponse.json(
      {
        error: "Owner user_id is not linked to a Spojex user. Reassign ownership.",
        code: "owner_user_missing",
        owner_user_id: ownerId,
        owner: null,
      },
      { status: 400 },
    );
  }

  // Only mutate membership when the caller can write.
  const canWrite = await requireAdminPermission("organizations:write");
  if (canWrite.ok) {
    const now = new Date().toISOString();
    const { error: upsertError } = await client.from("organization_members").upsert(
      {
        organization_id: id,
        user_id: ownerId,
        member_role: "owner",
        status: "active",
        joined_at: now,
      },
      { onConflict: "organization_id,user_id" },
    );
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }
  }

  return NextResponse.json({
    ok: true,
    organization_id: id,
    owner_user_id: ownerId,
    owner: user,
    membership: { member_role: "owner", status: "active" },
  });
}
