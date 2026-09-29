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
