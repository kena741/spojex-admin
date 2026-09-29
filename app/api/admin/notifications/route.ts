import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function GET() {
  const auth = await requireAdminPermission("notifications:read");
  if (!auth.ok) return auth.error;
  const { data, error } = await auth.context.client
    .from("notifications")
    .select("id, user_id, kind, title, body, payload, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}
