import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import {
  buildChangeMetadata,
  buildUpdateSummary,
} from "@/lib/activity-log-changes";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

const allowed = [
  "name",
  "description",
  "organization_type",
  "country",
  "city",
  "currency",
  "website",
  "logo_url",
  "verified",
] as const;

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

async function dependencySummary(
  // Spojex client query builder — keep loosely typed to match PostgREST chain.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { from: (table: string) => any },
  id: string,
) {
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
      const { count, error } = await client
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
  const linkedTotal = Object.values(deps).reduce<number>(
    (sum, n) => sum + (typeof n === "number" ? n : 0),
    0,
  );
  return {
    dependencies: deps,
    blocking,
    can_delete: true,
    can_trash: true,
    can_purge: Object.keys(blocking).length === 0,
    linked_content_count: linkedTotal,
    soft_cleanup: [] as string[],
    preserves_links: true,
    message:
      linkedTotal > 0
        ? "Move this item to Trash? Linked content will be preserved."
        : "Move this item to Trash?",
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await request.json()) as Record<string, unknown>;
  const { id } = await params;

  const patchKeys = Object.keys(body).filter(
    (k) => !["reason", "verification_reason", "expected_updated_at"].includes(k),
  );
  const verifyOnly =
    body.verified !== undefined && patchKeys.every((k) => k === "verified");
  const permission = verifyOnly ? "organizations:verify" : "organizations:write";
  const auth = await requireAdminPermission(permission);
  if (!auth.ok) return auth.error;

  const proxied = await proxyPython(`/api/v1/admin/organizations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }
  if (proxied && [400, 403, 404, 409].includes(proxied.res.status)) {
    return NextResponse.json(
      { error: pythonErrorMessage(proxied.payload), ...(proxied.payload as object) },
      { status: proxied.res.status },
    );
  }

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const { data: existing } = await auth.context.client
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (existing.deleted_at) {
    return NextResponse.json(
      { error: "Restore this organization from Trash before editing." },
      { status: 400 },
    );
  }

  const reason = String(body.reason || body.verification_reason || "").trim();
  if (body.verified === true && !existing.verified && !reason) {
    return NextResponse.json(
      { error: "A verification reason is required" },
      { status: 400 },
    );
  }

  const expected = typeof body.expected_updated_at === "string" ? body.expected_updated_at : null;
  if (expected && existing.updated_at) {
    const current = String(existing.updated_at);
    if (current.slice(0, 19) !== expected.slice(0, 19)) {
      return NextResponse.json(
        { error: "Organization was updated elsewhere. Refresh and try again.", code: "conflict" },
        { status: 409 },
      );
    }
  }

  if (typeof patch.website === "string" && patch.website.trim()) {
    let website = patch.website.trim();
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    patch.website = website;
  }

  patch.updated_at = new Date().toISOString();

  const { data, error: updateError } = await auth.context.client
    .from("organizations")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updateError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }

  const before = (existing ?? {}) as Record<string, unknown>;
  const after = (data ?? { ...before, ...patch }) as Record<string, unknown>;
  const changesMeta = buildChangeMetadata(before, after, Object.keys(patch));
  await logAdminActivity({
    context: auth.context,
    request,
    action: verifyOnly ? "verify" : "update",
    resource_type: "organization",
    resource_id: id,
    summary: buildUpdateSummary(
      `Updated organization ${String(after.name ?? id)}`,
      Array.isArray(changesMeta.changes)
        ? (changesMeta.changes as { field: string; label?: string }[])
        : [],
    ),
    metadata: {
      ...changesMeta,
      verification_reason: reason || null,
      actor_id: auth.context.staff?.id ?? null,
      actor_email: auth.context.staff?.email ?? null,
    },
  });

  return NextResponse.json({ data, source: "local" });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") === "1";

  const proxied = await proxyPython(
    `/api/v1/admin/organizations/${id}?dry_run=${dryRun ? 1 : 0}`,
    { method: "DELETE" },
  );
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }
  if (proxied && [400, 404].includes(proxied.res.status)) {
    return NextResponse.json(
      { error: pythonErrorMessage(proxied.payload), ...(proxied.payload as object) },
      { status: proxied.res.status },
    );
  }

  const { data: existing, error: loadError } = await auth.context.client
    .from("organizations")
    .select("id, name, public_id, is_platform, verified, archived_at, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    const hint = missingServiceRoleMessage();
    const message = loadError.message.includes("deleted_at")
      ? "Trash requires the latest database migration (deleted_at)."
      : loadError.message;
    return NextResponse.json(
      { error: hint ? `${message}. ${hint}` : message },
      { status: 400 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (existing.is_platform) {
    return NextResponse.json(
      { error: "The Spojex platform organization cannot be deleted." },
      { status: 400 },
    );
  }

  const summary = await dependencySummary(auth.context.client, id);

  if (dryRun) {
    return NextResponse.json({
      ...summary,
      is_platform: false,
      name: existing.name,
      already_deleted: Boolean(existing.deleted_at),
      mode: "trash",
      source: "local",
    });
  }

  if (existing.deleted_at) {
    return NextResponse.json({
      ok: true,
      already_deleted: true,
      deleted_at: existing.deleted_at,
      dependencies: summary.dependencies,
      mode: "trash",
      source: "local",
    });
  }

  const now = new Date().toISOString();
  const snapshot = {
    verified: Boolean(existing.verified),
    archived_at: existing.archived_at ?? null,
  };
  let deletedBy: string | null = null;
  if (auth.context.staff?.user_id) {
    const { data: actorUser } = await auth.context.client
      .from("users")
      .select("id")
      .eq("user_id", auth.context.staff.user_id)
      .maybeSingle();
    deletedBy = actorUser?.id ?? null;
  }

  const { error: updateError } = await auth.context.client
    .from("organizations")
    .update({
      deleted_at: now,
      deleted_by: deletedBy,
      delete_snapshot: snapshot,
      verified: false,
      updated_at: now,
    })
    .eq("id", id);
  if (updateError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "delete",
    resource_type: "organization",
    resource_id: id,
    summary: `Moved organization ${String(existing.name ?? existing.public_id ?? id)} to Trash`,
    metadata: {
      name: existing.name,
      public_id: existing.public_id,
      dependencies: summary.dependencies,
      linked_content_count: summary.linked_content_count,
      mode: "trash",
    },
  });

  return NextResponse.json({
    ok: true,
    deleted_at: now,
    deleted_by: deletedBy,
    dependencies: summary.dependencies,
    linked_content_count: summary.linked_content_count,
    mode: "trash",
    message: "Moved to Trash. Linked content was preserved.",
    source: "local",
  });
}
