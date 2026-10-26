import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

/**
 * List / assign organization staff (DB member_role = admin; product "Staff").
 * Does NOT transfer ownership.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let auth = await requireAdminPermission("organizations:read");
  if (!auth.ok) auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/organizations/${id}/managers`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
    } catch {
      // local fallback
    }
  }

  const { data, error } = await auth.context.client
    .from("organization_members")
    .select(
      "user_id, member_role, status, joined_at, assigned_by, role_updated_at, users:user_id(id, display_name, email, username, avatar_url, role)",
    )
    .eq("organization_id", id)
    .eq("member_role", "admin")
    .eq("status", "active");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    organization_id: id,
    managers: data ?? [],
    source: "local",
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as { user_id?: string };
  const userId = body.user_id?.trim();
  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/organizations/${id}/managers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ user_id: userId }),
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        await logAdminActivity({
          context: auth.context,
          request,
          action: "assign_manager",
          resource_type: "organization",
          resource_id: id,
          summary: `Assigned staff ${userId}`,
          metadata: payload as Record<string, unknown>,
        });
        return NextResponse.json({ ...payload, source: "python" });
      }
      if (res.status >= 400 && res.status < 500) {
        const detail =
          (payload as { detail?: { message?: string } }).detail?.message ||
          (payload as { error?: string }).error ||
          "Add staff failed";
        return NextResponse.json({ error: detail }, { status: res.status });
      }
    } catch {
      // local fallback
    }
  }

  const { data: org, error: orgError } = await auth.context.client
    .from("organizations")
    .select("id, name, user_id, is_platform, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 400 });
  }
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (org.deleted_at) {
    return NextResponse.json(
      { error: "Restore this organization from Trash before assigning staff." },
      { status: 400 },
    );
  }
  if (org.is_platform) {
    return NextResponse.json(
      { error: "Cannot assign staff to the Spojex platform organization" },
      { status: 400 },
    );
  }
  if (String(org.user_id) === userId) {
    return NextResponse.json(
      { error: "User is already the organization owner" },
      { status: 400 },
    );
  }

  const { data: target, error: userError } = await auth.context.client
    .from("users")
    .select("id, display_name, email, username, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 400 });
  }
  if (!target?.id) {
    return NextResponse.json({ error: "User not found" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const actorId = auth.context.user?.id ?? null;

  const { data: existing } = await auth.context.client
    .from("organization_members")
    .select("member_role, status")
    .eq("organization_id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.member_role === "owner") {
    return NextResponse.json(
      { error: "Cannot assign the owner as staff; use Reassign owner" },
      { status: 400 },
    );
  }

  const already =
    existing?.member_role === "admin" && existing?.status === "active";

  const { error: upsertError } = await auth.context.client
    .from("organization_members")
    .upsert(
      {
        organization_id: id,
        user_id: userId,
        member_role: "admin",
        status: "active",
        joined_at: existing ? undefined : now,
        assigned_by: actorId,
        role_updated_at: now,
      },
      { onConflict: "organization_id,user_id" },
    );
  if (upsertError) {
    // Retry without optional columns if migration not applied.
    const { error: fallbackError } = await auth.context.client
      .from("organization_members")
      .upsert(
        {
          organization_id: id,
          user_id: userId,
          member_role: "admin",
          status: "active",
          joined_at: now,
        },
        { onConflict: "organization_id,user_id" },
      );
    if (fallbackError) {
      return NextResponse.json({ error: fallbackError.message }, { status: 400 });
    }
  }

  const result = {
    ok: true,
    organization_id: id,
    user_id: userId,
    member_role: "admin",
    status: "active",
    already_manager: already,
    user: target,
    assigned_by: actorId,
    product_role: "staff",
    already_staff: already,
    note: "Staff has operational access; ownership was not transferred.",
    source: "local",
  };

  await logAdminActivity({
    context: auth.context,
    request,
    action: "assign_manager",
    resource_type: "organization",
    resource_id: id,
    summary: `Assigned staff ${target.display_name || userId} to ${org.name}`,
    metadata: result,
  });

  return NextResponse.json(result);
}
