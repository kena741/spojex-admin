export const eventStatuses = [
  { id: "pending", label: "Pending" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "rejected", label: "Rejected" },
] as const;

export function eventStatusLabel(status?: string | null) {
  return eventStatuses.find((item) => item.id === status)?.label ?? status ?? "—";
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
