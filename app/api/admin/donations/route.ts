import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { slugifyDonation } from "@/lib/donations";

export async function POST(request: Request) {
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    title?: string;
    slug?: string;
    summary?: string;
    description?: string;
    image_url?: string;
    cover_url?: string;
    goal_amount?: number;
    goal_coins?: number;
    beneficiary_user_id?: string | null;
    currency?: string;
    status?: string;
    is_featured?: boolean;
    sort_order?: number;
  };
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const slug = (body.slug?.trim() || slugifyDonation(title)).toLowerCase();
  const currency = (body.currency ?? "COIN").toUpperCase();
  const goalAmount = body.goal_amount ?? body.goal_coins ?? 0;
  const { data, error: insertError } = await auth.context.client
    .from("donation_campaigns")
    .insert({
      title,
      slug,
      summary: body.summary ?? "",
      description: body.description ?? "",
      image_url: body.image_url ?? "",
      cover_url: body.cover_url ?? "",
      goal_amount: goalAmount,
      goal_coins: body.goal_coins ?? (currency === "COIN" || currency === "COINS" ? goalAmount : 0),
      beneficiary_user_id: body.beneficiary_user_id ?? null,
      currency,
      status: body.status ?? "draft",
      is_featured: body.is_featured ?? false,
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
