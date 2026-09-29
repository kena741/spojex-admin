import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { normalizeHttpsUrl, slugifyMiniApp } from "@/lib/miniapps";

export async function POST(request: Request) {
  const auth = await requireAdminPermission("miniapps:write");
  if (!auth.ok) return auth.error;
  const payload = (await request.json()) as {
    name?: string;
    slug?: string;
    partner?: string;
    summary?: string;
    category?: string;
    icon?: string;
    logo_url?: string;
    url?: string;
    published?: boolean;
    sort_order?: number;
  };
  const name = payload.name?.trim();
  const url = normalizeHttpsUrl(payload.url ?? "");
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json(
      { error: "A valid https:// URL is required" },
      { status: 400 },
    );
  }
  const slug = (payload.slug?.trim() || slugifyMiniApp(name)).toLowerCase();
  const { data, error: insertError } = await auth.context.client
    .from("mini_apps")
    .insert({
      name,
      slug,
      partner: payload.partner?.trim() || name,
      summary: payload.summary?.trim() ?? "",
      category: payload.category?.trim() || "Services",
      icon: payload.icon?.trim() || "apps",
      logo_url: payload.logo_url?.trim() || "",
      url,
      published: payload.published ?? true,
      sort_order: payload.sort_order ?? 0,
    })
    .select()
    .single();
  if (insertError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${insertError.message}. ${hint}` : insertError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
