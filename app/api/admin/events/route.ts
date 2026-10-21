import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { slugifyEvent } from "@/lib/events";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

/** Server-side directory: filters, pagination, tier pricing, inventory aggregates. */
export async function GET(request: Request) {
  const auth = await requireAdminPermission("events:read");
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const res = await fetch(
    `${getSpojexApiBaseUrl()}/api/v1/admin/events?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: (payload as { error?: string }).error || "Failed to load events" },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
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
