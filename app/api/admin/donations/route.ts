import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { slugifyDonation } from "@/lib/donations";
import { resolvePlatformBeneficiaryUserId } from "@/lib/platform-beneficiary";

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
  const isCoin = currency === "COIN" || currency === "COINS";
  const goalAmount = Number(body.goal_amount ?? body.goal_coins ?? 0) || 0;
  const goalCoins = Number(
    body.goal_coins ?? (isCoin ? goalAmount : 0),
  ) || 0;
  if (isCoin && goalCoins <= 0) {
    return NextResponse.json(
      { error: "Goal (coins) must be greater than 0" },
      { status: 400 },
    );
  }
  if (!isCoin && goalAmount <= 0) {
    return NextResponse.json(
      { error: "Goal amount must be greater than 0" },
      { status: 400 },
    );
  }
  // Explicit admin choice wins; otherwise default to Spojex platform org owner.
  let beneficiary =
    typeof body.beneficiary_user_id === "string" && body.beneficiary_user_id.trim()
      ? body.beneficiary_user_id.trim()
      : null;
  if (isCoin && !beneficiary) {
    beneficiary = await resolvePlatformBeneficiaryUserId(auth.context.client);
    if (!beneficiary) {
      return NextResponse.json(
        {
          error:
            "Spojex platform org has no owner user. Create the platform org first, or set a beneficiary.",
        },
        { status: 400 },
      );
    }
  }
  const status = (body.status ?? "active").trim() || "active";
  const { data, error: insertError } = await auth.context.client
    .from("donation_campaigns")
    .insert({
      title,
      slug,
      summary: body.summary ?? "",
      description: body.description ?? "",
      image_url: body.image_url ?? "",
      cover_url: body.cover_url ?? "",
      goal_amount: isCoin ? goalCoins : goalAmount,
      raised_amount: 0,
      goal_coins: isCoin ? goalCoins : 0,
      raised_coins: 0,
      beneficiary_user_id: beneficiary,
      currency: isCoin ? "COIN" : currency,
      status,
      is_featured: body.is_featured ?? false,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();
  if (insertError) {
    const hint = missingServiceRoleMessage();
    const message = insertError.message || "Could not create campaign";
    // Common Spojex cutover miss: NOT NULL columns without defaults.
    const friendly =
      /summary|description|image_url|cover_url|raised_|created_at|updated_at/i.test(
        message,
      )
        ? `${message}. Check required campaign fields.`
        : message;
    return NextResponse.json(
      { error: hint ? `${friendly}. ${hint}` : friendly },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
