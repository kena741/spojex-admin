import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";

export async function GET() {
  const auth = await requireAnyAdminPermission([
    "donations:read",
    "requests:read",
  ]);
  if (!auth.ok) return auth.error;
  const { data, error } = await auth.context.client
    .from("coin_redemptions")
    .select("*, users(id, display_name, email, phone)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}
