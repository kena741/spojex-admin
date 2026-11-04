import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission, requireAnyAdminPermission } from "@/lib/admin-auth";
import { slugifyCategory } from "@/lib/service-categories";

export async function GET() {
  const auth = await requireAnyAdminPermission([
    "catalog:read",
    "services:read",
    "catalog:write",
    "services:write",
  ]);
  if (!auth.ok) return auth.error;

  const [categories, subcategories] = await Promise.all([
    auth.context.client.from("service_categories").select("*").order("sort_order", { ascending: true }),
    auth.context.client.from("service_subcategories").select("*").order("sort_order", { ascending: true }),
  ]);
  if (categories.error) {
    return NextResponse.json({ error: categories.error.message }, { status: 400 });
  }
  if (subcategories.error) {
    return NextResponse.json({ error: subcategories.error.message }, { status: 400 });
  }
  return NextResponse.json({
    data: categories.data ?? [],
    subcategories: subcategories.data ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("catalog:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    label?: string;
    emoji?: string;
    sort_order?: number;
    slug?: string;
    is_sport?: boolean;
  };
  const label = body.label?.trim();
  if (!label) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  const slug = (body.slug?.trim() || slugifyCategory(label)).toLowerCase();
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }
  const { data, error: insertError } = await auth.context.client
    .from("service_categories")
    .insert({
      slug,
      label,
      emoji: body.emoji ?? "",
      sort_order: body.sort_order ?? 0,
      is_sport: body.is_sport !== false,
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
