import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAnyAdminPermission } from "@/lib/admin-auth";

const allowed = ["title", "image_url", "link_url", "is_active", "sort_order"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission(["banners:write", "services:write"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in body)) continue;
    if (key === "title" || key === "image_url" || key === "link_url") {
      const value = body[key];
      patch[key] = typeof value === "string" ? value.trim() : "";
    } else if (key === "sort_order") {
      patch[key] = Number(body[key]) || 0;
    } else if (key === "is_active") {
      patch[key] = Boolean(body[key]);
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data, error } = await auth.context.client
    .from("banners")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Banner not found" }, { status: 404 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission(["banners:write", "services:write"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { error } = await auth.context.client.from("banners").delete().eq("id", id);
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
