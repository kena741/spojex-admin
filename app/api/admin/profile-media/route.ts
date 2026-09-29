import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";

export async function GET() {
  const auth = await requireAnyAdminPermission(["users:read", "profiles:read"]);
  if (!auth.ok) return auth.error;

  const withUsers = await auth.context.client
    .from("profile_media")
    .select("*, users:user_id(id, display_name, username, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!withUsers.error) {
    return NextResponse.json({ data: withUsers.data ?? [] });
  }

  const plain = await auth.context.client
    .from("profile_media")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (plain.error) {
    return NextResponse.json({ error: plain.error.message }, { status: 400 });
  }
  return NextResponse.json({ data: plain.data ?? [] });
}
