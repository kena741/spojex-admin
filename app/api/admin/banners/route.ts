import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { normalizeBannerLinks, validateBannerLinks } from "@/lib/banner-links";

export async function GET() {
  const auth = await requireAnyAdminPermission([
    "banners:read",
    "banners:write",
    "services:read",
    "services:write",
  ]);
  if (!auth.ok) return auth.error;

  const { data, error } = await auth.context.client
    .from("banners")
    .select("*")
    .order("sort_order")
    .order("created_at", { ascending: false });

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAnyAdminPermission(["banners:write", "services:write"]);
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    title?: string;
    image_url?: string;
    link_url?: string;
    ios_url?: string;
    android_url?: string;
    is_active?: boolean;
    sort_order?: number;
  };

  const links = normalizeBannerLinks(body);
  const linkError = validateBannerLinks(links);
  if (linkError) return NextResponse.json({ error: linkError }, { status: 400 });

  const { data, error } = await auth.context.client
    .from("banners")
    .insert({
      title: (body.title ?? "").trim(),
      image_url: (body.image_url ?? "").trim(),
      ...links,
      is_active: body.is_active !== false,
      sort_order: Number(body.sort_order) || 0,
    })
    .select()
    .single();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
