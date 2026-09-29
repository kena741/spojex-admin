import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    name?: string;
    slug?: string;
    emoji?: string;
    coin_value?: number;
    sort_order?: number;
    is_active?: boolean;
  };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const slug =
    body.slug?.trim() ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const coinValue = Number(body.coin_value) || 0;
  if (coinValue <= 0) {
    return NextResponse.json({ error: "coin_value must be > 0" }, { status: 400 });
  }
  const { data, error } = await auth.context.client
    .from("coin_gifts")
    .insert({
      name,
      slug,
      emoji: body.emoji ?? "",
      coin_value: coinValue,
      sort_order: Number(body.sort_order) || 0,
      is_active: body.is_active !== false,
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
