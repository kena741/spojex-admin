import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import {
  buildChangeMetadata,
  buildUpdateSummary,
} from "@/lib/activity-log-changes";

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await request.json()) as Record<string, unknown>;
  const permission =
    body.verified !== undefined && Object.keys(body).length === 1
      ? "organizations:verify"
      : "organizations:write";
  const auth = await requireAdminPermission(permission);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const { data: existing } = await auth.context.client
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

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
    action: body.verified !== undefined && Object.keys(body).length === 1
      ? "verify"
      : "update",
    resource_type: "organization",
    resource_id: id,
    summary: buildUpdateSummary(
      `Updated organization ${String(after.name ?? id)}`,
      Array.isArray(changesMeta.changes)
        ? (changesMeta.changes as { field: string; label?: string }[])
        : [],
    ),
    metadata: changesMeta,
  });

  return NextResponse.json({ data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data: existing, error: loadError } = await auth.context.client
    .from("organizations")
    .select("id, name, public_id, is_platform")
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
      { error: "The Spojex platform organization cannot be deleted." },
      { status: 400 },
    );
  }

  const { error: deleteError } = await auth.context.client
    .from("organizations")
    .delete()
    .eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    const message = deleteError.message.includes("foreign key")
      ? `Cannot delete “${existing.name}”: linked records still reference it (${deleteError.message}).`
      : deleteError.message;
    return NextResponse.json(
      { error: hint ? `${message}. ${hint}` : message },
      { status: 400 },
    );
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "delete",
    resource_type: "organization",
    resource_id: id,
    summary: `Deleted organization ${String(existing.name ?? existing.public_id ?? id)}`,
    metadata: {
      name: existing.name,
      public_id: existing.public_id,
    },
  });

  return NextResponse.json({ ok: true });
}
