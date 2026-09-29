import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { slugifyCategory } from "@/lib/service-categories";

export async function POST(request: Request) {
  const auth = await requireAdminPermission("catalog:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    category_id?: string;
    label?: string;
    emoji?: string;
    slug?: string;
    sort_order?: number;
    is_sport?: boolean;
  };
  const categoryId = body.category_id?.trim();
  const label = body.label?.trim();
  if (!categoryId) {
    return NextResponse.json({ error: "category_id is required" }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  const slug = (body.slug?.trim() || slugifyCategory(label)).toLowerCase();
  const { data, error: insertError } = await auth.context.client
    .from("service_subcategories")
    .insert({
      category_id: categoryId,
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
