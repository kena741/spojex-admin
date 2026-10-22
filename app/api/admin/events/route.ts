import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import {
  eventDisplayPricing,
  eventTicketSales,
  slugifyEvent,
} from "@/lib/events";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

function apiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const body = payload as {
    message?: unknown;
    detail?: unknown;
    error?: unknown;
  };
  for (const value of [body.message, body.detail, body.error]) {
    if (typeof value === "string" && value.trim()) {
      // Prefer human message over machine codes like "not_found".
      if (value.includes("_") && value === value.toLowerCase() && !value.includes(" ")) {
        continue;
      }
      return value.trim();
    }
  }
  if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
  return fallback;
}

type EventRow = Record<string, unknown> & {
  id: string;
  name?: string;
  status?: string;
  lifecycle?: string;
  visibility?: string;
  venue_name?: string;
  location?: string;
  organizer_name?: string;
  starts_at?: string;
  ticket_price?: number;
  currency?: string;
  capacity?: number;
  is_upcoming?: boolean;
  is_featured?: boolean;
};

async function listEventsLocal(
  // Spojex table client - thenable query builders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { from: (table: string) => any },
  search: URLSearchParams,
) {
  const page = Math.max(1, Number(search.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(search.get("page_size") || 40) || 40));
  const q = (search.get("q") || "").trim().toLowerCase();
  const status = (search.get("status") || "all").toLowerCase();
  const lifecycle = (search.get("lifecycle") || "all").toLowerCase();
  const visibility = (search.get("visibility") || "all").toLowerCase();
  const sales = (search.get("sales") || "all").toLowerCase();
  const organizer = (search.get("organizer") || "").trim().toLowerCase();
  const venue = (search.get("venue") || "").trim().toLowerCase();
  const windowFilter = search.get("window") || "";
  const startsFrom = search.get("starts_from");
  const startsTo = search.get("starts_to");
  const orderAsc = (search.get("order") || "desc").toLowerCase() === "asc";

  const { data, error } = await client
    .from("events")
    .select("*")
    .order("starts_at", { ascending: orderAsc })
    .limit(500);
  if (error) throw new Error(error.message);

  const eventIds = ((data ?? []) as EventRow[]).map((row) => row.id).filter(Boolean);
  const [tiersRes, ticketsRes] = await Promise.all([
    eventIds.length
      ? client
          .from("event_ticket_tiers")
          .select("*")
          .order("sort_order", { ascending: true })
          .limit(2000)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    eventIds.length
      ? client
          .from("event_tickets")
          .select("event_id, status, quantity, amount, currency, checked_in_at, checked_out_at")
          .order("created_at", { ascending: false })
          .limit(5000)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);

  // Soft-fail enrichment tables.
  const tiers = (!tiersRes.error ? tiersRes.data : []) ?? [];
  const tickets = (!ticketsRes.error ? ticketsRes.data : []) ?? [];

  const tiersByEvent = new Map<string, Record<string, unknown>[]>();
  for (const tier of tiers) {
    const eventId = String(tier.event_id || "");
    if (!eventId) continue;
    const list = tiersByEvent.get(eventId) ?? [];
    list.push(tier);
    tiersByEvent.set(eventId, list);
  }
  const ticketsByEvent = new Map<string, Record<string, unknown>[]>();
  for (const ticket of tickets) {
    const eventId = String(ticket.event_id || "");
    if (!eventId) continue;
    const list = ticketsByEvent.get(eventId) ?? [];
    list.push(ticket);
    ticketsByEvent.set(eventId, list);
  }

  const now = Date.now();
  const in14d = now + 14 * 24 * 60 * 60 * 1000;
  const excludedUpcoming = new Set(["cancelled", "canceled", "ended", "completed"]);

  let rows = ((data ?? []) as EventRow[]).filter((row) => {
    if (status !== "all" && String(row.status || "").toLowerCase() !== status) return false;
    if (lifecycle !== "all" && String(row.lifecycle || "").toLowerCase() !== lifecycle) {
      return false;
    }
    if (visibility !== "all" && String(row.visibility || "").toLowerCase() !== visibility) {
      return false;
    }
    if (organizer) {
      const hay = String(row.organizer_name || "").toLowerCase();
      if (!hay.includes(organizer)) return false;
    }
    if (venue) {
      const hay = `${row.venue_name || ""} ${row.location || ""}`.toLowerCase();
      if (!hay.includes(venue)) return false;
    }
    if (q) {
      const hay = [
        row.name,
        row.venue_name,
        row.location,
        row.organizer_name,
        row.slug,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    const startsAt = row.starts_at ? new Date(String(row.starts_at)).getTime() : NaN;
    if (startsFrom) {
      const from = new Date(startsFrom).getTime();
      if (!Number.isNaN(from) && (Number.isNaN(startsAt) || startsAt < from)) return false;
    }
    if (startsTo) {
      const to = new Date(startsTo).getTime();
      if (!Number.isNaN(to) && (Number.isNaN(startsAt) || startsAt > to)) return false;
    }
    if (windowFilter === "upcoming_14d") {
      const life = String(row.lifecycle || "").toLowerCase();
      if (excludedUpcoming.has(life)) return false;
      if (Number.isNaN(startsAt) || startsAt < now || startsAt > in14d) return false;
    }

    if (sales !== "all") {
      const life = String(row.lifecycle || "").toLowerCase();
      const st = String(row.status || "").toLowerCase();
      if (sales === "open") {
        if (!["sales_open", "published", "upcoming", "live"].includes(life) || st !== "active") {
          return false;
        }
      } else if (sales === "closed") {
        if (!["sales_closed", "sold_out", "completed", "cancelled"].includes(life)) return false;
      } else if (sales === "sold_out") {
        if (life !== "sold_out") return false;
      }
    }
    return true;
  });

  const total = rows.length;
  const start = (page - 1) * pageSize;
  rows = rows.slice(start, start + pageSize);

  const enriched = rows.map((row) => {
    const eventTiers = (tiersByEvent.get(row.id) ?? []).filter(
      (tier) => tier.is_active !== false,
    );
    const eventTickets = ticketsByEvent.get(row.id) ?? [];
    const pricing = eventDisplayPricing(
      eventTiers as { price?: number; currency?: string; is_active?: boolean }[],
      Number(row.ticket_price ?? 0),
      String(row.currency || "ETB"),
    );
    const salesSummary = eventTicketSales(
      eventTickets as {
        amount?: number;
        quantity?: number;
        currency?: string;
        status?: string;
        checked_in_at?: string | null;
        checked_out_at?: string | null;
      }[],
      String(row.currency || "ETB"),
    );
    const capacity = Number(row.capacity || 0);
    const held = salesSummary.capacityHeld;
    return {
      ...row,
      pricing,
      inventory: {
        confirmed_sold: salesSummary.sold,
        reserved: salesSummary.reserved,
        complimentary: salesSummary.complimentary,
        capacity_held: held,
        capacity,
        available: capacity > 0 ? Math.max(0, capacity - held) : null,
        inside_now: salesSummary.inside,
      },
      verified_collections: {
        amount: salesSummary.revenue,
        currency: salesSummary.currency,
        label: "Verified payment collections (not pending checkouts)",
      },
      href: `/admin/events/${row.id}`,
    };
  });

  return {
    data: enriched,
    total,
    page,
    page_size: pageSize,
    source: "local",
    timezone: "Africa/Addis_Ababa",
  };
}

/** Server-side directory: prefer Python aggregates; fall back to local table reads. */
export async function GET(request: Request) {
  const auth = await requireAdminPermission("events:read");
  if (!auth.ok) return auth.error;

  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of [
    "q",
    "status",
    "lifecycle",
    "visibility",
    "sales",
    "organizer",
    "venue",
    "window",
    "starts_from",
    "starts_to",
    "page",
    "page_size",
    "sort",
    "order",
  ]) {
    const value = incoming.searchParams.get(key);
    if (value) params.set(key, value);
  }

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/events?${params}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        return NextResponse.json({ ...payload, source: "python" });
      }
      // Fall through to local on deploy gaps / route 404s / schema mismatches.
      console.warn(
        "[events directory] python failed",
        res.status,
        apiErrorMessage(payload, "Failed to load events"),
      );
    } catch (err) {
      console.warn("[events directory] python unreachable", err);
    }
  }

  try {
    const local = await listEventsLocal(auth.context.client, params);
    return NextResponse.json(local);
  } catch (err) {
    const hint = missingServiceRoleMessage();
    const message = err instanceof Error ? err.message : "Failed to load events";
    return NextResponse.json(
      { error: hint ? `${message}. ${hint}` : message },
      { status: 400 },
    );
  }
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
  // Backend events columns are NOT NULL without DB defaults - send full row.
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
