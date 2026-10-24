import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

/** Demote or remove an organization manager. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;
  const { id, userId } = await params;
  const url = new URL(request.url);
  const demote = url.searchParams.get("demote") !== "false";

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/organizations/${id}/managers/${userId}?demote=${demote}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        await logAdminActivity({
          context: auth.context,
          request,
          action: "remove_manager",
          resource_type: "organization",
          resource_id: id,
          summary: `Removed manager ${userId}`,
          metadata: payload as Record<string, unknown>,
        });
        return NextResponse.json({ ...payload, source: "python" });
      }
      if (res.status >= 400 && res.status < 500) {
        const detail =
          (payload as { detail?: { message?: string } }).detail?.message ||
          (payload as { error?: string }).error ||
          "Remove manager failed";
        return NextResponse.json({ error: detail }, { status: res.status });
      }
    } catch {
      // local fallback
    }
  }

  const { data: org } = await auth.context.client
    .from("organizations")
    .select("id, user_id, name")
    .eq("id", id)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (String(org.user_id) === userId) {
    return NextResponse.json(
      { error: "Cannot remove the organization owner via manager tools" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  if (demote) {
    const { error } = await auth.context.client
      .from("organization_members")
      .update({
        member_role: "member",
        status: "active",
        role_updated_at: now,
        assigned_by: null,
      })
      .eq("organization_id", id)
      .eq("user_id", userId);
    if (error) {
      const { error: fallback } = await auth.context.client
        .from("organization_members")
        .update({ member_role: "member", status: "active" })
        .eq("organization_id", id)
        .eq("user_id", userId);
      if (fallback) {
        return NextResponse.json({ error: fallback.message }, { status: 400 });
      }
    }
  } else {
    const { error } = await auth.context.client
      .from("organization_members")
      .delete()
      .eq("organization_id", id)
      .eq("user_id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const result = {
    ok: true,
    organization_id: id,
    user_id: userId,
    action: demote ? "demoted" : "removed",
    source: "local",
  };
  await logAdminActivity({
    context: auth.context,
    request,
    action: "remove_manager",
    resource_type: "organization",
    resource_id: id,
    summary: `${demote ? "Demoted" : "Removed"} manager ${userId} from ${org.name}`,
    metadata: result,
  });
  return NextResponse.json(result);
}
