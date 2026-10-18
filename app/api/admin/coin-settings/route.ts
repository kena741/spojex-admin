import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

/** Persist admin buy/credit rate. Prefer coins_per_birr (1 Birr = N coins). */
export async function POST(request: Request) {
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    etb_per_coin?: number;
    coins_per_birr?: number;
  };

  let rate: number | null = null;
  const coinsPerBirr = Number(body.coins_per_birr);
  if (Number.isFinite(coinsPerBirr) && coinsPerBirr > 0) {
    rate = 1 / coinsPerBirr;
  } else {
    const etbPerCoin = Number(body.etb_per_coin);
    if (Number.isFinite(etbPerCoin) && etbPerCoin > 0) {
      rate = etbPerCoin;
    }
  }

  if (rate == null || rate <= 0) {
    return NextResponse.json(
      { error: "Provide coins_per_birr (>0) or etb_per_coin (>0)." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.context.client
    .from("coin_settings")
    .upsert({
      id: 1,
      etb_per_coin: rate,
      updated_at: new Date().toISOString(),
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
  const etbPerCoin = Number(data?.etb_per_coin ?? rate);
  return NextResponse.json({
    data: {
      ...data,
      coins_per_birr: etbPerCoin > 0 ? 1 / etbPerCoin : null,
    },
  });
}
