import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission, requireAdminSession } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

const allowed = [
  "display_name",
  "full_name",
  "username",
  "role",
  "headline",
  "bio",
  "country",
  "city",
  "currency",
  "website",
  "phone",
  "email",
  "verified",
  "avatar_url",
  "cover_url",
] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await request.json()) as Record<string, unknown>;
  const permission = body.verified !== undefined && Object.keys(body).length === 1 ? "users:verify" : "users:write";
  const auth = await requireAdminPermission(permission);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }
  const { data, error: updateError } = await auth.context.client.from("users").update(patch).eq("id", id).select().maybeSingle();
  if (updateError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

/**
 * Soft-delete a user.
 * Any signed-in admin may call this (no users:write permission required).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.error;

  const { id } = await params;
  if (auth.context.user.id === id) {
    return NextResponse.json({ error: "You cannot delete your own account from admin." }, { status: 400 });
  }

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = getSpojexApiBaseUrl();
  const res = await fetch(`${base}/api/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    detail?: string;
  };
  if (!res.ok) {
    return NextResponse.json(
      { error: payload.message || payload.detail || payload.error || "Delete failed" },
      { status: res.status },
    );
  }
  return NextResponse.json({ ok: true });
}
