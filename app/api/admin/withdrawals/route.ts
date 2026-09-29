import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function GET() {
  const auth = await requireAdminPermission("requests:read");
  if (!auth.ok) return auth.error;
  const { data, error } = await auth.context.client
    .from("withdrawal_requests")
    .select("*, users:user_id(id, display_name, full_name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}
