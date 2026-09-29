import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { normalizeTicketCode } from "@/lib/events";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const code = normalizeTicketCode(new URL(request.url).searchParams.get("code") ?? "");

  let query = auth.context.client
    .from("event_tickets")
    .select("*, users:user_id(id, display_name, email, phone)")
    .eq("event_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (code) query = query.eq("ticket_code", code);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data ?? [] });
}
