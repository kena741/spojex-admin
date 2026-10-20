import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

const DEFAULT_ETB_PER_COIN = 0.1;

async function etbPerCoinFromDb(client: {
  from: (table: string) => any;
}): Promise<number> {
  const { data } = await client
    .from("coin_settings")
    .select("etb_per_coin")
    .eq("id", 1)
    .maybeSingle();
  const rate = Number(data?.etb_per_coin);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_ETB_PER_COIN;
}

function priceEtbForCoins(coins: number, etbPerCoin: number): number {
  return Math.round(coins * etbPerCoin * 100) / 100;
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    name?: string;
    coins?: number;
    bonus_coins?: number;
    price_etb?: number;
    sort_order?: number;
    is_active?: boolean;
  };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const coins = Number(body.coins) || 0;
  if (coins <= 0) {
    return NextResponse.json({ error: "coins must be > 0" }, { status: 400 });
  }
  const rate = await etbPerCoinFromDb(auth.context.client);
  // Always derive ETB from admin 1-coin rate; ignore client price_etb.
  const price_etb = priceEtbForCoins(coins, rate);
  const { data, error } = await auth.context.client
    .from("coin_packages")
    .insert({
      name,
      coins,
      bonus_coins: Number(body.bonus_coins) || 0,
      price_etb,
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
