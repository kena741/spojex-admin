/**
 * Shared Marketplace overview ↔ directory filter contract.
 * Keep in sync with spojex_backend admin_marketplace SQL facets.
 */

export type BookingScheduleFacet = "upcoming_14d" | "unscheduled" | "overdue";
export type BookingEventFacet = "created" | "completed" | "closed";

export const BOOKING_PENDING_STATUSES = ["pending", "awaiting_payment"] as const;
export const BOOKING_CLOSED_STATUSES = ["cancelled", "declined"] as const;

export function bookingsHref(parts: {
  status?: string | string[];
  schedule?: BookingScheduleFacet;
  event?: BookingEventFacet;
  from?: string;
  to?: string;
  id?: string;
}): string {
  const params = new URLSearchParams();
  if (parts.status) {
    params.set("status", Array.isArray(parts.status) ? parts.status.join(",") : parts.status);
  }
  if (parts.schedule) params.set("schedule", parts.schedule);
  if (parts.event) params.set("event", parts.event);
  if (parts.from) params.set("from", parts.from);
  if (parts.to) params.set("to", parts.to);
  if (parts.id) params.set("id", parts.id);
  const qs = params.toString();
  return qs ? `/admin/requests?${qs}` : "/admin/requests";
}

export function financeServiceHref(parts: {
  start: string;
  end: string;
  status?: string;
}): string {
  const params = new URLSearchParams({
    module: "service",
    asset: "money",
    range: "custom",
    start: parts.start,
    end: parts.end,
    status: parts.status || "verified",
  });
  return `/admin/finance/transactions?${params}`;
}

export function overviewRangeParams(input: {
  rangeDays?: number;
  start?: string | null;
  end?: string | null;
}): URLSearchParams {
  const p = new URLSearchParams();
  if (input.start && input.end) {
    p.set("start", input.start);
    p.set("end", input.end);
  } else {
    p.set("range_days", String(input.rangeDays || 30));
  }
  return p;
}
