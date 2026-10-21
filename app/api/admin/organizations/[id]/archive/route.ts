import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason?.trim() || null;

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/organizations/${id}/archive`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason }),
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      if (res.status >= 400 && res.status < 500) {
        const detail =
          (payload as { detail?: { message?: string } }).detail?.message ||
          (payload as { error?: string }).error ||
          "Archive failed";
        return NextResponse.json({ error: detail }, { status: res.status });
      }
    } catch {
      // local fallback
    }
  }

  const { data: org, error: loadError } = await auth.context.client
    .from("organizations")
    .select("id, name, is_platform, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json(
      {
        error:
          loadError.message.includes("archived_at")
            ? "Archive requires the latest database migration (archived_at)."
            : loadError.message,
      },
      { status: 400 },
    );
  }
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (org.is_platform) {
    return NextResponse.json(
      { error: "The Spojex platform organization cannot be archived." },
      { status: 400 },
    );
  }
  if (org.archived_at) {
    return NextResponse.json({ ok: true, already_archived: true, source: "local" });
  }

  const now = new Date().toISOString();
  const { error } = await auth.context.client
    .from("organizations")
    .update({ archived_at: now, updated_at: now })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "archive",
    resource_type: "organization",
    resource_id: id,
    summary: `Archived organization ${org.name}`,
    metadata: { reason, archived_at: now },
  });

  return NextResponse.json({ ok: true, archived_at: now, reason, source: "local" });
}
