import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { slugifyEvent } from "@/lib/events";

export async function GET() {
  const auth = await requireAdminPermission("events:read");
  if (!auth.ok) return auth.error;
  const [eventsRes, ticketsRes] = await Promise.all([
    auth.context.client.from("events").select("*").order("starts_at", { ascending: false }).limit(500),
    auth.context.client
      .from("event_tickets")
      .select("id, event_id, amount, quantity, status, currency, ticket_code, ticket_number, users:user_id(id, display_name)")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);
  if (eventsRes.error) {
    return NextResponse.json({ error: eventsRes.error.message }, { status: 400 });
  }
  if (ticketsRes.error) {
    return NextResponse.json({ data: eventsRes.data ?? [], sales: {}, tickets: [] });
  }

  const sales: Record<string, { sold: number; sales: number; currency: string }> = {};
  const paid = new Set(["confirmed", "used"]);
  for (const row of ticketsRes.data ?? []) {
    const eventId = `${row.event_id ?? ""}`;
    if (!eventId || !paid.has(`${row.status ?? ""}`)) continue;
    const current = sales[eventId] ?? { sold: 0, sales: 0, currency: row.currency || "ETB" };
    current.sold += Math.max(1, Number(row.quantity || 1));
    current.sales += Number(row.amount || 0);
    if (row.currency) current.currency = row.currency;
    sales[eventId] = current;
  }

  return NextResponse.json({
    data: eventsRes.data ?? [],
    sales,
    tickets: ticketsRes.data ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    name?: string;
    venue_name?: string;
    location?: string;
    address?: string;
    starts_at?: string;
    ends_at?: string;
    ticket_price?: number;
    currency?: string;
    capacity?: number;
    description?: string;
    image_url?: string;
    status?: string;
    is_upcoming?: boolean;
  };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const startsAt = body.starts_at?.trim();
  if (!startsAt) return NextResponse.json({ error: "Start time is required" }, { status: 400 });

  const slugBase = slugifyEvent(name) || "event";
  const { data, error } = await auth.context.client
    .from("events")
    .insert({
      name,
      slug: `${slugBase}-${Date.now().toString(36).slice(-6)}`,
      venue_name: body.venue_name?.trim() ?? "",
      location: body.location?.trim() ?? "",
      address: body.address?.trim() ?? "",
      starts_at: startsAt,
      ends_at: body.ends_at?.trim() || null,
      ticket_price: body.ticket_price ?? 0,
      currency: body.currency?.trim() || "ETB",
      capacity: body.capacity ?? 0,
      description: body.description ?? "",
      image_url: body.image_url ?? "",
      status: body.status ?? "active",
      is_upcoming: body.is_upcoming === true,
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
