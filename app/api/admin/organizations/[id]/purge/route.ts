import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

async function proxyPython(path: string, init?: RequestInit) {
  const token = await requestAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${getSpojexApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    const payload = await res.json().catch(() => ({}));
    return { res, payload };
  } catch {
    return null;
  }
}

function pythonErrorMessage(payload: unknown): string {
  const p = payload as {
    detail?: { message?: string } | string;
    error?: string;
    message?: string;
  };
  if (typeof p.detail === "string") return p.detail;
  if (p.detail && typeof p.detail === "object" && p.detail.message) return p.detail.message;
  return p.error || p.message || "Request failed";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const body = (await request.json().catch(() => ({}))) as { confirm_name?: string };
  const confirmName = String(body.confirm_name || "").trim();

  const proxied = await proxyPython(
    `/api/v1/admin/organizations/${id}/purge?dry_run=${dryRun ? 1 : 0}`,
    { method: "POST", body: JSON.stringify({ confirm_name: confirmName || " " }) },
  );
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }
  if (proxied && [400, 404, 409].includes(proxied.res.status)) {
    return NextResponse.json(
      { error: pythonErrorMessage(proxied.payload), ...(proxied.payload as object) },
      { status: proxied.res.status },
    );
  }

  const { data: existing, error: loadError } = await auth.context.client
    .from("organizations")
    .select("id, name, public_id, is_platform, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${loadError.message}. ${hint}` : loadError.message },
      { status: 400 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (existing.is_platform) {
    return NextResponse.json(
      { error: "The Spojex platform organization cannot be permanently deleted." },
      { status: 400 },
    );
  }
  if (!existing.deleted_at) {
    return NextResponse.json(
      { error: "Move the organization to Trash before permanent deletion." },
      { status: 400 },
    );
  }

  const deps: Record<string, number | null> = {};
  const checks: Array<{ key: string; table: string; column: string }> = [
    { key: "members", table: "organization_members", column: "organization_id" },
    { key: "followers", table: "organization_follows", column: "organization_id" },
    { key: "gyms", table: "gyms", column: "organization_id" },
    { key: "live_events", table: "live_events", column: "host_org_id" },
    { key: "sport_news", table: "sport_news", column: "organization_id" },
    {
      key: "chat_join_requests",
      table: "organization_chat_join_requests",
      column: "organization_id",
    },
  ];
  for (const check of checks) {
    try {
      const { count, error } = await auth.context.client
        .from(check.table)
        .select("*", { count: "exact", head: true })
        .eq(check.column, id);
      deps[check.key] = error ? null : count ?? 0;
    } catch {
      deps[check.key] = null;
    }
  }
  const hardKeys = ["gyms", "live_events", "sport_news"] as const;
  const blocking = Object.fromEntries(
    hardKeys
      .map((k) => [k, deps[k]] as const)
      .filter(([, n]) => typeof n === "number" && n > 0),
  );

  if (dryRun) {
    return NextResponse.json({
      can_purge: Object.keys(blocking).length === 0,
      dependencies: deps,
      blocking,
      name: existing.name,
      mode: "purge",
      source: "local",
    });
  }

  if (Object.keys(blocking).length > 0) {
    return NextResponse.json(
      {
        error: `Cannot permanently delete “${existing.name}” while linked content remains. Reassign or unlink first.`,
        dependencies: deps,
        blocking,
        code: "has_dependencies",
      },
      { status: 400 },
    );
  }

  if (confirmName !== String(existing.name || "").trim()) {
    return NextResponse.json(
      { error: "Type the organization name exactly to confirm permanent deletion." },
      { status: 400 },
    );
  }

  for (const table of [
    "organization_chat_join_requests",
    "organization_follows",
    "organization_members",
  ]) {
    await auth.context.client.from(table).delete().eq("organization_id", id);
  }

  const { error: deleteError } = await auth.context.client
    .from("organizations")
    .delete()
    .eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    const message = deleteError.message.includes("foreign key")
      ? `Cannot permanently delete “${existing.name}”: linked records still reference it.`
      : deleteError.message;
    return NextResponse.json(
      { error: hint ? `${message}. ${hint}` : message, dependencies: deps },
      { status: 400 },
    );
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "purge",
    resource_type: "organization",
    resource_id: id,
    summary: `Permanently deleted organization ${String(existing.name ?? existing.public_id ?? id)}`,
    metadata: { name: existing.name, public_id: existing.public_id, dependencies: deps },
  });

  return NextResponse.json({ ok: true, permanently_deleted: true, source: "local" });
}
