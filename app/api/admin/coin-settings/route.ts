import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as { etb_per_coin?: number };
  const rate = Number(body.etb_per_coin);
  if (!Number.isFinite(rate) || rate < 0) {
    return NextResponse.json({ error: "etb_per_coin must be >= 0" }, { status: 400 });
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
  return NextResponse.json({ data });
}
