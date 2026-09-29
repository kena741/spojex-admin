import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { slugifyCategory } from "@/lib/service-categories";

export async function GET() {
  const auth = await requireAdminPermission("gyms:read");
  if (!auth.ok) return auth.error;
  const { data, error } = await auth.context.client
    .from("gym_categories")
    .select("*")
    .order("sort_order");
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
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    label?: string;
    emoji?: string;
    sort_order?: number;
    slug?: string;
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
    .from("gym_categories")
    .insert({
      slug,
      label,
      emoji: body.emoji ?? "",
      sort_order: body.sort_order ?? 0,
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
