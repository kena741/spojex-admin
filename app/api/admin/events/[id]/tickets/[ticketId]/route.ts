import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; ticketId: string }> },
) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id, ticketId } = await params;
  const body = (await request.json()) as { action?: string };
  const action = body.action;

  const { data: current, error: loadError } = await auth.context.client
    .from("event_tickets")
    .select("id, status, checked_in_at, checked_out_at")
    .eq("id", ticketId)
    .eq("event_id", id)
    .maybeSingle();
  if (loadError || !current) {
    return NextResponse.json({ error: loadError?.message || "Ticket not found" }, { status: 404 });
  }
  if (current.status !== "confirmed" && current.status !== "used") {
    return NextResponse.json({ error: "Ticket is not paid" }, { status: 400 });
  }

  const inAt = `${current.checked_in_at ?? ""}`;
  const outAt = `${current.checked_out_at ?? ""}`;
  const inside = Boolean(inAt) && !outAt;
  const stamp = new Date().toISOString();

  let patch: Record<string, unknown>;
  if (action === "checkin") {
    if (inside) return NextResponse.json({ error: "Already checked in" }, { status: 400 });
    patch = { checked_in_at: stamp, checked_out_at: null, status: "confirmed" };
  } else if (action === "checkout") {
    if (!inside) return NextResponse.json({ error: "Not checked in" }, { status: 400 });
    patch = { checked_out_at: stamp };
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data, error } = await auth.context.client
    .from("event_tickets")
    .update(patch)
    .eq("id", ticketId)
    .eq("event_id", id)
    .select("*, users:user_id(id, display_name, email, phone)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
