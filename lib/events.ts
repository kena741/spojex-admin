export const eventStatuses = [
  { id: "pending", label: "Pending" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "rejected", label: "Rejected" },
] as const;

export const eventCategories = [
  { id: "football", label: "Football" },
  { id: "basketball", label: "Basketball" },
  { id: "tournament", label: "Tournament" },
  { id: "match", label: "Match" },
  { id: "training", label: "Training" },
  { id: "festival", label: "Sports Festival" },
  { id: "fan_event", label: "Fan Event" },
  { id: "other", label: "Other" },
] as const;

export const eventVisibilities = [
  { id: "public", label: "Public" },
  { id: "private", label: "Private (invite/RSVP)" },
  { id: "unlisted", label: "Unlisted" },
] as const;

export const eventLifecycles = [
  { id: "draft", label: "Draft" },
  { id: "published", label: "Published" },
  { id: "upcoming", label: "Upcoming" },
  { id: "sales_open", label: "Sales open" },
  { id: "sales_closed", label: "Sales closed" },
  { id: "live", label: "Live" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "postponed", label: "Postponed" },
  { id: "sold_out", label: "Sold out" },
] as const;

export const eventRsvpStatuses = [
  { id: "invited", label: "Invited" },
  { id: "viewed", label: "Viewed" },
  { id: "going", label: "Going" },
  { id: "declined", label: "Declined" },
  { id: "waitlisted", label: "Waitlisted" },
  { id: "cancelled", label: "Cancelled" },
] as const;

export function eventStatusLabel(status?: string | null) {
  return eventStatuses.find((item) => item.id === status)?.label ?? status ?? "—";
}

export function eventCategoryLabel(category?: string | null) {
  return eventCategories.find((item) => item.id === category)?.label ?? category ?? "Other";
}

export function eventVisibilityLabel(visibility?: string | null) {
  return eventVisibilities.find((item) => item.id === visibility)?.label ?? visibility ?? "Public";
}

export function eventLifecycleLabel(lifecycle?: string | null) {
  return eventLifecycles.find((item) => item.id === lifecycle)?.label ?? lifecycle ?? "Sales open";
}

export function eventRsvpStatusLabel(status?: string | null) {
  return eventRsvpStatuses.find((item) => item.id === status)?.label ?? status ?? "—";
}

export function slugifyEvent(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function eventDateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${value}`.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatEventWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function normalizeTicketCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatEventPrice(amount: number | null | undefined, currency = "ETB") {
  if (amount == null) return "—";
  return `${Number(amount).toLocaleString()} ${currency}`;
}

export function eventPhotoUrls(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((item) => `${item}`.trim())
    .filter((item) => item.startsWith("http"));
}

export function eventCoverUrl(row: { image_url?: string | null; photos?: unknown }) {
  const direct = `${row.image_url ?? ""}`.trim();
  if (direct.startsWith("http")) return direct;
  return eventPhotoUrls(row.photos)[0] ?? "";
}

export type EventTicketSales = {
  sold: number;
  sales: number;
  inside: number;
  pending: number;
  cancelled: number;
  currency: string;
};

const paidTicketStatuses = new Set(["confirmed", "used"]);

export function eventTicketSales(
  tickets: {
    amount?: number | null;
    quantity?: number | null;
    currency?: string | null;
    status?: string | null;
    checked_in_at?: string | null;
    checked_out_at?: string | null;
  }[],
  fallbackCurrency = "ETB",
): EventTicketSales {
  let sold = 0;
  let sales = 0;
  let inside = 0;
  let pending = 0;
  let cancelled = 0;
  let currency = fallbackCurrency;
  for (const row of tickets) {
    const quantity = Math.max(1, Number(row.quantity || 1));
    if (paidTicketStatuses.has(row.status ?? "")) {
      sold += quantity;
      sales += Number(row.amount || 0);
      if (row.currency) currency = row.currency;
    } else if (row.status === "pending") {
      pending += quantity;
    } else if (row.status === "cancelled") {
      cancelled += quantity;
    }
    if (row.checked_in_at && !row.checked_out_at) inside += 1;
  }
  return { sold, sales, inside, pending, cancelled, currency };
}

export function ticketIsInside(row: { checked_in_at?: string | null; checked_out_at?: string | null }) {
  return Boolean(row.checked_in_at) && !row.checked_out_at;
}

export type EventTierSales = {
  tierId: string;
  name: string;
  capacity: number;
  sold: number;
  remaining: number | null;
  revenue: number;
  checkedIn: number;
  currency: string;
};

/** Sales breakdown by ticket tier (falls back to "General Admission" for legacy tickets). */
export function eventSalesByTier(
  tickets: {
    tier_id?: string | null;
    tier_name?: string | null;
    amount?: number | null;
    quantity?: number | null;
    currency?: string | null;
    status?: string | null;
    checked_in_at?: string | null;
    checked_out_at?: string | null;
  }[],
  tiers: {
    id: string;
    name: string;
    capacity: number;
    currency?: string | null;
  }[],
  fallbackCurrency = "ETB",
): EventTierSales[] {
  const paid = new Set(["confirmed", "used"]);
  const byKey = new Map<string, EventTierSales>();

  for (const tier of tiers) {
    byKey.set(tier.id, {
      tierId: tier.id,
      name: tier.name,
      capacity: tier.capacity,
      sold: 0,
      remaining: tier.capacity > 0 ? tier.capacity : null,
      revenue: 0,
      checkedIn: 0,
      currency: tier.currency || fallbackCurrency,
    });
  }

  for (const row of tickets) {
    const key = row.tier_id || "__legacy__";
    const quantity = Math.max(1, Number(row.quantity || 1));
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        tierId: key,
        name: row.tier_name?.trim() || "General Admission",
        capacity: 0,
        sold: 0,
        remaining: null,
        revenue: 0,
        checkedIn: 0,
        currency: row.currency || fallbackCurrency,
      };
      byKey.set(key, bucket);
    }
    if (paid.has(row.status ?? "")) {
      bucket.sold += quantity;
      bucket.revenue += Number(row.amount || 0);
      if (row.currency) bucket.currency = row.currency;
    }
    if (ticketIsInside(row)) bucket.checkedIn += 1;
  }

  return [...byKey.values()].map((row) => ({
    ...row,
    remaining: row.capacity > 0 ? Math.max(0, row.capacity - row.sold) : null,
  }));
}
