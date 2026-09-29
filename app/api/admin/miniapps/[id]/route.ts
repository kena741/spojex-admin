import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { normalizeHttpsUrl, slugifyMiniApp } from "@/lib/miniapps";

const allowed = [
  "name",
  "slug",
  "partner",
  "summary",
  "category",
  "icon",
  "logo_url",
  "url",
  "published",
  "sort_order",
] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("miniapps:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (typeof patch.name === "string") patch.name = patch.name.trim();
  if (typeof patch.partner === "string") patch.partner = patch.partner.trim();
  if (typeof patch.summary === "string") patch.summary = patch.summary.trim();
  if (typeof patch.category === "string") patch.category = patch.category.trim();
  if (typeof patch.icon === "string") patch.icon = patch.icon.trim();
  if (typeof patch.logo_url === "string") {
    patch.logo_url = patch.logo_url.trim();
  } else if (patch.logo_url === null) {
    patch.logo_url = "";
  }
  if (typeof patch.slug === "string") {
    patch.slug = (patch.slug.trim() || slugifyMiniApp(`${patch.name ?? ""}`)).toLowerCase();
  }
  if (typeof patch.url === "string") {
    const url = normalizeHttpsUrl(patch.url);
    if (!url) {
      return NextResponse.json(
        { error: "A valid https:// URL is required" },
        { status: 400 },
      );
    }
    patch.url = url;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data, error: updateError } = await auth.context.client
    .from("mini_apps")
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
  if (!data) {
    return NextResponse.json({ error: "Mini app not found" }, { status: 404 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("miniapps:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { error: deleteError } = await auth.context.client.from("mini_apps").delete().eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
