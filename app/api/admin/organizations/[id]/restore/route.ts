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

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/organizations/${id}/restore`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      if (res.status >= 400 && res.status < 500) {
        const detail =
          (payload as { detail?: { message?: string } }).detail?.message ||
          (payload as { error?: string }).error ||
          "Restore failed";
        return NextResponse.json({ error: detail, ...(payload as object) }, { status: res.status });
      }
    } catch {
      // local fallback
    }
  }

  const { data: org, error: loadError } = await auth.context.client
    .from("organizations")
    .select("id, name, public_id, deleted_at, delete_snapshot, verified, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json(
      {
        error: loadError.message.includes("deleted_at")
          ? "Restore requires the latest database migration (deleted_at)."
          : loadError.message,
      },
      { status: 400 },
    );
  }
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (!org.deleted_at) {
    return NextResponse.json({ ok: true, already_restored: true, source: "local" });
  }

  const snapshot =
    org.delete_snapshot && typeof org.delete_snapshot === "object"
      ? (org.delete_snapshot as { verified?: boolean; archived_at?: string | null })
      : {};

  const { data: conflict } = await auth.context.client
    .from("organizations")
    .select("id, name")
    .eq("public_id", org.public_id)
    .is("deleted_at", null)
    .neq("id", id)
    .maybeSingle();
  if (conflict) {
    return NextResponse.json(
      {
        error: `Cannot restore: public id is used by “${conflict.name}”. Resolve the conflict before restoring.`,
        code: "conflict",
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { error } = await auth.context.client
    .from("organizations")
    .update({
      deleted_at: null,
      deleted_by: null,
      delete_snapshot: null,
      verified: Boolean(snapshot.verified),
      archived_at: snapshot.archived_at ?? null,
      updated_at: now,
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "restore",
    resource_type: "organization",
    resource_id: id,
    summary: `Restored organization ${org.name} from Trash`,
    metadata: {
      verified: Boolean(snapshot.verified),
      archived_at: snapshot.archived_at ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    restored_at: now,
    verified: Boolean(snapshot.verified),
    source: "local",
  });
}
