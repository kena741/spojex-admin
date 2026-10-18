import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

const allowed = [
  "name",
  "slug",
  "venue_name",
  "location",
  "address",
  "starts_at",
  "ends_at",
  "ticket_price",
  "currency",
  "capacity",
  "photos",
  "image_url",
  "description",
  "status",
  "is_upcoming",
  "category",
  "visibility",
  "lifecycle",
  "service_fee_percent",
  "important_info",
  "entry_rules",
  "organizer_name",
  "organizer_info",
  "schedule",
  "sponsors",
  "sales_starts_at",
  "sales_ends_at",
  "invite_token",
  "latitude",
  "longitude",
  "is_featured",
] as const;

/**
 * Child cleanup order matters (tickets/payments reference tiers & orders).
 * Spojex API FK errors are friendly ("related item…") without "foreign key" text,
 * so we always clear dependents before deleting the event.
 */
const EVENT_CHILD_TABLES = [
  "event_scan_logs",
  "event_payments",
  "event_tickets",
  "event_managers",
  "event_rsvps",
  "event_ticket_tiers",
] as const;

function isMissingTableError(message: string) {
  const msg = message.toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("undefined_table") ||
    msg.includes("not found") ||
    msg.includes("couldn't find") ||
    msg.includes("could not find") ||
    msg.includes("unknown table") ||
    msg.includes("could not find the table")
  );
}

function isFkOrRelatedError(message: string, code?: string) {
  const msg = message.toLowerCase();
  if (code === "invalid_reference" || code === "db_error") return true;
  return (
    msg.includes("foreign key") ||
    msg.includes("violates") ||
    msg.includes("still referenced") ||
    msg.includes("restrict") ||
    msg.includes("related item") ||
    msg.includes("invalid_reference")
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }
  const { data, error } = await auth.context.client
    .from("events")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const client = auth.context.client;
  const hint = missingServiceRoleMessage();

  // Order items hang off orders (no event_id) — clear those first.
  const { data: orders, error: ordersListError } = await client
    .from("event_orders")
    .select("id")
    .eq("event_id", id);
  if (ordersListError && !isMissingTableError(ordersListError.message || "")) {
    return NextResponse.json(
      {
        error: hint
          ? `Could not list event orders: ${ordersListError.message}. ${hint}`
          : `Could not list event orders: ${ordersListError.message}`,
      },
      { status: 400 },
    );
  }
  const orderIds = ((orders ?? []) as Array<{ id?: string }>)
    .map((row) => `${row.id ?? ""}`)
    .filter(Boolean);
  if (orderIds.length > 0) {
    const { error: itemsError } = await client
      .from("event_order_items")
      .delete()
      .in("order_id", orderIds);
    if (itemsError && !isMissingTableError(itemsError.message || "")) {
      return NextResponse.json(
        {
          error: hint
            ? `Could not clear event_order_items: ${itemsError.message}. ${hint}`
            : `Could not clear event_order_items: ${itemsError.message}`,
        },
        { status: 400 },
      );
    }
  }

  for (const table of EVENT_CHILD_TABLES) {
    const { error } = await client.from(table).delete().eq("event_id", id);
    if (error && !isMissingTableError(error.message || "")) {
      return NextResponse.json(
        {
          error: hint
            ? `Could not clear ${table}: ${error.message}. ${hint}`
            : `Could not clear ${table}: ${error.message}`,
        },
        { status: 400 },
      );
    }
  }

  // Orders after tickets/payments (those may FK to order_id).
  const { error: ordersError } = await client.from("event_orders").delete().eq("event_id", id);
  if (ordersError && !isMissingTableError(ordersError.message || "")) {
    return NextResponse.json(
      {
        error: hint
          ? `Could not clear event_orders: ${ordersError.message}. ${hint}`
          : `Could not clear event_orders: ${ordersError.message}`,
      },
      { status: 400 },
    );
  }

  const { error: deleteError } = await client.from("events").delete().eq("id", id);
  if (!deleteError) {
    return NextResponse.json({ ok: true });
  }

  const msg = deleteError.message || "Delete failed";
  if (isFkOrRelatedError(msg, deleteError.code)) {
    return NextResponse.json(
      {
        error: hint
          ? `Event still has related records. ${msg}. ${hint}`
          : `Event still has related records. ${msg}`,
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: hint ? `${msg}. ${hint}` : msg },
    { status: 400 },
  );
}
