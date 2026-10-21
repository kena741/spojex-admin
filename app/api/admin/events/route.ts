import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { slugifyEvent } from "@/lib/events";

export async function GET() {
  const auth = await requireAdminPermission("events:read");
  if (!auth.ok) return auth.error;
  const [eventsRes, ticketsRes, paymentsRes, tiersRes] = await Promise.all([
    auth.context.client.from("events").select("*").order("starts_at", { ascending: false }).limit(500),
    auth.context.client
      .from("event_tickets")
      .select(
        "id, event_id, amount, quantity, status, currency, ticket_code, ticket_number, tier_id, users:user_id(id, display_name)",
      )
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(5000),
    auth.context.client
      .from("event_payments")
      .select("id, event_id, amount, currency, status, paid_at")
      .limit(5000),
    auth.context.client.from("event_ticket_tiers").select("id, event_id, name, price, currency").limit(2000),
  ]);
  if (eventsRes.error) {
    return NextResponse.json({ error: eventsRes.error.message }, { status: 400 });
  }
  if (ticketsRes.error) {
    return NextResponse.json({ data: eventsRes.data ?? [], sales: {}, tickets: [] });
  }

  type SalesAgg = {
    sold: number;
    sales: number;
    currency: string;
    complimentary: number;
    reserved: number;
    refunded: number;
    revenue_source: "event_payments" | "ticket_amounts" | "mixed";
    listed_price_note: string;
  };

  const sales: Record<string, SalesAgg> = {};
  const paidTicket = new Set(["confirmed", "used"]);
  const complimentary = new Set(["complimentary", "comp", "free", "issued"]);
  const reserved = new Set(["reserved", "hold", "pending"]);
  const refunded = new Set(["refunded", "partial_refund"]);
  const paidPayment = new Set(["paid", "success", "completed", "verified"]);

  for (const row of ticketsRes.data ?? []) {
    const eventId = `${row.event_id ?? ""}`;
    if (!eventId) continue;
    const status = `${row.status ?? ""}`.toLowerCase();
    const current =
      sales[eventId] ??
      ({
        sold: 0,
        sales: 0,
        currency: row.currency || "ETB",
        complimentary: 0,
        reserved: 0,
        refunded: 0,
        revenue_source: "ticket_amounts",
        listed_price_note: "Ticket tiers override legacy event.ticket_price when present",
      } satisfies SalesAgg);

    if (paidTicket.has(status)) {
      current.sold += Math.max(1, Number(row.quantity || 1));
      // Ticket amount kept as fallback; verified payments preferred below.
      current.sales += Number(row.amount || 0);
    } else if (complimentary.has(status)) {
      current.complimentary += Math.max(1, Number(row.quantity || 1));
    } else if (reserved.has(status)) {
      current.reserved += Math.max(1, Number(row.quantity || 1));
    } else if (refunded.has(status)) {
      current.refunded += Math.max(1, Number(row.quantity || 1));
    }
    if (row.currency) current.currency = row.currency;
    sales[eventId] = current;
  }

  // Prefer verified payment totals for revenue (handles discounts / true capture).
  const paymentTotals: Record<string, { amount: number; currency: string; count: number }> = {};
  for (const pay of paymentsRes.data ?? []) {
    const eventId = `${pay.event_id ?? ""}`;
    const status = `${pay.status ?? ""}`.toLowerCase();
    if (!eventId || !paidPayment.has(status)) continue;
    const cur = paymentTotals[eventId] ?? {
      amount: 0,
      currency: pay.currency || "ETB",
      count: 0,
    };
    cur.amount += Number(pay.amount || 0);
    cur.count += 1;
    if (pay.currency) cur.currency = pay.currency;
    paymentTotals[eventId] = cur;
  }

  for (const [eventId, pay] of Object.entries(paymentTotals)) {
    const current =
      sales[eventId] ??
      ({
        sold: 0,
        sales: 0,
        currency: pay.currency,
        complimentary: 0,
        reserved: 0,
        refunded: 0,
        revenue_source: "event_payments",
        listed_price_note: "Ticket tiers override legacy event.ticket_price when present",
      } satisfies SalesAgg);
    current.sales = pay.amount;
    current.currency = pay.currency;
    current.revenue_source = current.sold > 0 ? "mixed" : "event_payments";
    sales[eventId] = current;
  }

  const tiersByEvent: Record<string, { id: string; name: string; price: number; currency: string }[]> =
    {};
  for (const tier of tiersRes.data ?? []) {
    const eventId = `${tier.event_id ?? ""}`;
    if (!eventId) continue;
    (tiersByEvent[eventId] ??= []).push({
      id: String(tier.id),
      name: String(tier.name ?? ""),
      price: Number(tier.price || 0),
      currency: String(tier.currency || "ETB"),
    });
  }

  return NextResponse.json({
    data: eventsRes.data ?? [],
    sales,
    tickets: ticketsRes.data ?? [],
    tiers_by_event: tiersByEvent,
    pricing_note:
      "List Price uses event.ticket_price (legacy). Revenue prefers verified event_payments; ticket.amount is fallback. Sold counts confirmed/used tickets only.",
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
    category?: string;
    visibility?: string;
    lifecycle?: string;
  };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const startsAt = body.starts_at?.trim();
  if (!startsAt) return NextResponse.json({ error: "Start time is required" }, { status: 400 });

  const slugBase = slugifyEvent(name) || "event";
  // Backend events columns are NOT NULL without DB defaults — send full row.
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
      photos: [],
      description: body.description ?? "",
      image_url: body.image_url ?? "",
      status: body.status ?? "active",
      is_upcoming: body.is_upcoming === true,
      is_featured: false,
      category: body.category?.trim() || "other",
      visibility: body.visibility?.trim() || "public",
      lifecycle: body.lifecycle?.trim() || "sales_open",
      service_fee_percent: 0,
      schedule: [],
      important_info: "",
      entry_rules: "",
      organizer_name: "",
      organizer_info: "",
      sponsors: [],
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
