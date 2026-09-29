import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function GET() {
  const auth = await requireAdminPermission("messages:read");
  if (!auth.ok) return auth.error;
  const { data, error } = await auth.context.client
    .from("messages")
    .select("id, conversation_id, sender_id, body, media_path, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}
