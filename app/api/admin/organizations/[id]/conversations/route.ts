import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

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
        `${getSpojexApiBaseUrl()}/api/v1/admin/organizations/${id}/conversations`,
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
    .from("conversations")
    .select(
      "id, type, state, title, organization_id, org_thread_kind, last_message_at, last_message_preview, created_at",
    )
    .eq("organization_id", id)
    .order("last_message_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const groups: Record<string, unknown>[] = [];
  const privateChats: Record<string, unknown>[] = [];
  for (const row of data ?? []) {
    const kind = String(row.org_thread_kind || "").toLowerCase();
    if (kind === "dm") privateChats.push(row);
    else groups.push(row);
  }

  let groupMembers: Record<string, unknown>[] = [];
  const primaryGroupId = groups[0] ? String(groups[0].id) : null;
  if (primaryGroupId) {
    const { data: memberRows } = await auth.context.client
      .from("conversation_members")
      .select(
        "user_id, member_role, joined_at, users:user_id(id, display_name, username, email, avatar_url, role)",
      )
      .eq("conversation_id", primaryGroupId)
      .limit(500);
    groupMembers = (memberRows ?? []).map((row: Record<string, unknown>) => {
      const user =
        row.users && typeof row.users === "object"
          ? (row.users as Record<string, unknown>)
          : null;
      return {
        user_id: row.user_id,
        member_role: row.member_role,
        joined_at: row.joined_at,
        display_name: user?.display_name ?? null,
        username: user?.username ?? null,
        email: user?.email ?? null,
        avatar_url: user?.avatar_url ?? null,
        profile_role: user?.role ?? null,
      };
    });
  }

  return NextResponse.json({
    ok: true,
    organization_id: id,
    groups,
    private: privateChats,
    group_members: groupMembers,
    primary_group_id: primaryGroupId,
    source: "local",
  });
}
