import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("organizations:read");
  if (!auth.ok) {
    const write = await requireAdminPermission("organizations:write");
    if (!write.ok) return write.error;
  }
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

  return NextResponse.json({
    ok: true,
    organization_id: id,
    groups,
    private: privateChats,
    source: "local",
  });
}
