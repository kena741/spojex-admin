import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

/**
 * Reassign organization owner.
 * Updates organizations.user_id + memberships only.
 * Does NOT move coin wallets, gift balances, or historical transactions.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as {
    new_owner_user_id?: string;
    reason?: string;
  };

  const newOwnerId = body.new_owner_user_id?.trim();
  const reason = body.reason?.trim();
  if (!newOwnerId) {
    return NextResponse.json({ error: "new_owner_user_id is required" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Reason is required for ownership transfer" }, { status: 400 });
  }

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/organizations/${id}/reassign-owner`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ new_owner_user_id: newOwnerId, reason }),
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      if (res.status >= 400 && res.status < 500) {
        const detail =
          (payload as { detail?: { message?: string } }).detail?.message ||
          (payload as { error?: string }).error ||
          "Reassign failed";
        return NextResponse.json({ error: detail }, { status: res.status });
      }
    } catch {
      // local fallback
    }
  }

  const { data: org, error: loadError } = await auth.context.client
    .from("organizations")
    .select("id, name, user_id, is_platform")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (org.is_platform) {
    return NextResponse.json(
      { error: "Cannot reassign ownership of the Spojex platform organization" },
      { status: 400 },
    );
  }
  if (String(org.user_id) === newOwnerId) {
    return NextResponse.json({ error: "User is already the owner" }, { status: 400 });
  }

  const { data: newOwner, error: ownerError } = await auth.context.client
    .from("users")
    .select("id, display_name, email")
    .eq("id", newOwnerId)
    .maybeSingle();
  if (ownerError) {
    return NextResponse.json({ error: ownerError.message }, { status: 400 });
  }
  if (!newOwner?.id) {
    return NextResponse.json({ error: "Proposed owner user not found" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const previousOwnerId = org.user_id;

  const { error: updateError } = await auth.context.client
    .from("organizations")
    .update({ user_id: newOwnerId, updated_at: now })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await auth.context.client.from("organization_members").upsert(
    {
      organization_id: id,
      user_id: newOwnerId,
      member_role: "owner",
      status: "active",
      joined_at: now,
    },
    { onConflict: "organization_id,user_id" },
  );

  await auth.context.client.from("organization_members").upsert(
    {
      organization_id: id,
      user_id: previousOwnerId,
      member_role: "admin",
      status: "active",
      joined_at: now,
    },
    { onConflict: "organization_id,user_id" },
  );

  const result = {
    ok: true,
    organization_id: id,
    previous_owner_user_id: previousOwnerId,
    new_owner_user_id: newOwnerId,
    reason,
    wallets_moved: false,
    note: "Canonical ownership and memberships updated. Personal coin wallets were not moved.",
    source: "local",
  };

  await logAdminActivity({
    context: auth.context,
    request,
    action: "reassign_owner",
    resource_type: "organization",
    resource_id: id,
    summary: `Reassigned owner of ${org.name}`,
    metadata: result,
  });

  return NextResponse.json(result);
}
