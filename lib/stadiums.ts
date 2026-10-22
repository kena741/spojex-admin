export type StadiumSizeType = "mini" | "small" | "medium" | "large" | "professional";
export type StadiumStatus = "pending" | "active" | "inactive" | "rejected";
export type StadiumPlanType = "hourly" | "daily" | "monthly" | "yearly";

export const stadiumSizeTypes: { id: StadiumSizeType; label: string }[] = [
  { id: "mini", label: "Mini" },
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
  { id: "professional", label: "Professional" },
];

export const stadiumStatuses: { id: StadiumStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "rejected", label: "Rejected" },
];

export const stadiumPlanTypes: { id: StadiumPlanType; label: string }[] = [
  { id: "hourly", label: "Hourly reservation" },
  { id: "daily", label: "Daily pass" },
  { id: "monthly", label: "Monthly pass" },
  { id: "yearly", label: "Yearly pass" },
];

/** Explicit product semantics - keep UI/API/mobile labels aligned. */
export const STADIUM_PRODUCT_DEFINITIONS: Record<
  StadiumPlanType,
  { label: string; grants: string; enforces: string; does_not: string }
> = {
  hourly: {
    label: "Hourly reservation",
    grants: "Exclusive pitch interval for a specific date and start/end time.",
    enforces: "Availability windows, maintenance blocks, and collision rules.",
    does_not: "Does not grant multi-day access.",
  },
  daily: {
    label: "Daily pass",
    grants: "Access on a specific calendar date under venue entry rules.",
    enforces: "Valid on the pass date only.",
    does_not:
      "Does not imply exclusive pitch reservation unless inventory is configured as exclusive.",
  },
  monthly: {
    label: "Monthly pass",
    grants: "Access during the subscription validity period.",
    enforces: "Activation, expiry, venue scope, and entry rules after verified payment.",
    does_not: "Does not reserve exclusive hourly slots.",
  },
  yearly: {
    label: "Yearly pass",
    grants: "Access during the subscription validity period.",
    enforces: "Activation, expiry, venue scope, and entry rules after verified payment.",
    does_not: "Does not reserve exclusive hourly slots.",
  },
};

/** Canonical facility ids → display labels. */
export const STADIUM_FACILITY_CANON: Record<string, string> = {
  shower: "Showers",
  showers: "Showers",
  toilet: "Toilets",
  toilets: "Toilets",
  restroom: "Toilets",
  restrooms: "Toilets",
  grandstand: "Grandstand",
  shade: "Shade",
  floodlights: "Floodlights",
  lights: "Floodlights",
  "changing rooms": "Changing rooms",
  changing_rooms: "Changing rooms",
  parking: "Parking",
  seating: "Seating",
  "first aid": "First aid",
  first_aid: "First aid",
  cafeteria: "Cafeteria",
  "wi-fi": "Wi-Fi",
  wifi: "Wi-Fi",
  "artificial turf": "Artificial turf",
};

export type StadiumPricing = {
  currency: string;
  hourly: number | null;
  daily: number | null;
  monthly: number | null;
  yearly: number | null;
};

export const emptyStadiumPricing: StadiumPricing = {
  currency: "ETB",
  hourly: null,
  daily: null,
  monthly: null,
  yearly: null,
};

function jsonAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object") {
    const record = value as { amount?: unknown; price?: unknown; price_amount?: unknown };
    return jsonAmount(record.amount ?? record.price ?? record.price_amount);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseStadiumPricing(value: unknown): StadiumPricing {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...emptyStadiumPricing };
  }
  const record = value as Record<string, unknown>;
  return {
    currency: `${record.currency ?? "ETB"}`.trim() || "ETB",
    hourly: jsonAmount(record.hourly ?? record.hour ?? record.per_hour),
    daily: jsonAmount(record.daily ?? record.session ?? record.one_time ?? record.day),
    monthly: jsonAmount(record.monthly),
    yearly: jsonAmount(record.yearly),
  };
}

export function stadiumPricingPayload(pricing: StadiumPricing) {
  return {
    currency: pricing.currency.trim() || "ETB",
    ...(pricing.hourly != null ? { hourly: pricing.hourly } : {}),
    ...(pricing.daily != null
      ? { daily: pricing.daily, session: pricing.daily }
      : {}),
    ...(pricing.monthly != null ? { monthly: pricing.monthly } : {}),
    ...(pricing.yearly != null ? { yearly: pricing.yearly } : {}),
  };
}

export function sizeTypeLabel(sizeType?: string | null) {
  return stadiumSizeTypes.find((item) => item.id === sizeType)?.label ?? sizeType ?? "-";
}

export function stadiumStatusLabel(status?: string | null) {
  return stadiumStatuses.find((item) => item.id === status)?.label ?? status ?? "-";
}

export function planTypeLabel(planType?: string | null) {
  const raw = `${planType ?? ""}`.trim().toLowerCase();
  const type =
    raw === "one_time" || raw === "session" || raw === "day"
      ? "daily"
      : raw === "hour" || raw === "hr"
        ? "hourly"
        : raw;
  return stadiumPlanTypes.find((item) => item.id === type)?.label ?? type ?? "-";
}

export function slugifyStadium(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatPrice(amount: number | null | undefined, currency = "ETB") {
  if (amount == null) return "-";
  return `${Number(amount).toLocaleString()} ${currency}`;
}

function localDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type StadiumRevenueTotals = {
  daily: number;
  weekly: number;
  monthly: number;
  currency: string;
};

/** Completed payments: today, last 7 days, and the current calendar month. */
export function stadiumRevenueFromPayments(
  rows: {
    amount?: number | null;
    currency?: string | null;
    status?: string | null;
    paid_at?: string | null;
    created_at?: string | null;
  }[],
  fallbackCurrency = "ETB",
): StadiumRevenueTotals {
  const now = new Date();
  const today = localDateOnly(now);
  const weekStart = localDateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  let daily = 0;
  let weekly = 0;
  let monthly = 0;
  let currency = fallbackCurrency;

  for (const row of rows) {
    if (row.status && row.status !== "completed") continue;
    const paid = `${row.paid_at || row.created_at || ""}`.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paid)) continue;
    const amount = Number(row.amount) || 0;
    if (row.currency) currency = row.currency;
    if (paid >= monthStart) monthly += amount;
    if (paid >= weekStart) weekly += amount;
    if (paid === today) daily += amount;
  }

  return { daily, weekly, monthly, currency };
}

export function generateStadiumManagerPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let value = "Sx";
  for (let i = 0; i < 8; i += 1) {
    value += chars[Math.floor(Math.random() * chars.length)] ?? "x";
  }
  return value;
}

export const stadiumFacilityOptions = [
  "Showers",
  "Toilets",
  "Grandstand",
  "Shade",
  "Floodlights",
  "Changing rooms",
  "Parking",
  "Seating",
  "First aid",
  "Cafeteria",
  "Wi-Fi",
  "Artificial turf",
];

export type StadiumSurface = "Artificial" | "Grass" | "Red Ash" | "Other";

export const stadiumSurfaceOptions: { id: string; label: string }[] = [
  { id: "Artificial", label: "Artificial" },
  { id: "Grass", label: "Grass" },
  { id: "Red Ash", label: "Red Ash" },
  { id: "Other", label: "Other" },
];

export function stadiumSurfaceLabel(surface?: string | null) {
  const key = (surface ?? "").trim();
  if (!key) return "Artificial";
  return stadiumSurfaceOptions.find((item) => item.id === key)?.label ?? key;
}

export function normalizeStadiumSurface(value?: string | null) {
  const key = (value ?? "").trim();
  return key || "Artificial";
}

/** Normalize facility labels for storage / comparison (dedupe SHOWER vs Showers). */
export function normalizeStadiumFacility(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const key = trimmed.toLowerCase().replace(/_/g, " ");
  return STADIUM_FACILITY_CANON[key] || STADIUM_FACILITY_CANON[key.replace(/\s+/g, "")] || trimmed;
}

export function normalizeStadiumFacilities(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const label = normalizeStadiumFacility(String(raw ?? ""));
    if (!label) continue;
    const dedupe = label.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(label);
  }
  return out;
}

export function formatStadiumPriceState(
  amount: number | null | undefined,
  currency = "ETB",
): string {
  if (amount == null) return "Not set";
  if (amount === 0) return `Free (0 ${currency})`;
  return `${Number(amount).toLocaleString()} ${currency}`;
}

export function stadiumPhotoUrls(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  const urls: string[] = [];
  for (const item of photos) {
    if (typeof item === "string" && item.trim()) {
      urls.push(item.trim());
      continue;
    }
    if (item && typeof item === "object" && "url" in item) {
      const url = `${(item as { url?: unknown }).url ?? ""}`.trim();
      if (url) urls.push(url);
    }
  }
  return urls;
}

export function parseMapsCoordinates(input: string): { latitude: number; longitude: number } | null {
  const text = input.trim();
  if (!text) return null;
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return { latitude: Number(at[1]), longitude: Number(at[2]) };
  const query = text.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (query) return { latitude: Number(query[1]), longitude: Number(query[2]) };
  const pair = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (pair) return { latitude: Number(pair[1]), longitude: Number(pair[2]) };
  return null;
}

/** Cover image: prefer image_url, else first entry in photos. */
export function stadiumCoverUrl(row: {
  image_url?: string | null;
  photos?: unknown;
} | null | undefined) {
  if (!row) return "";
  const direct = `${row.image_url ?? ""}`.trim();
  if (direct) return direct;
  return stadiumPhotoUrls(row.photos)[0] ?? "";
}

/** 0 = Sunday … 6 = Saturday (matches Dart DateTime.weekday % 7). */
export const stadiumWeekDays: { day: number; label: string; short: string }[] = [
  { day: 1, label: "Monday", short: "Mon" },
  { day: 2, label: "Tuesday", short: "Tue" },
  { day: 3, label: "Wednesday", short: "Wed" },
  { day: 4, label: "Thursday", short: "Thu" },
  { day: 5, label: "Friday", short: "Fri" },
  { day: 6, label: "Saturday", short: "Sat" },
  { day: 0, label: "Sunday", short: "Sun" },
];

export type StadiumTimeSlot = {
  start_time: string;
  end_time: string;
};

export type StadiumWeekHour = {
  day_of_week: number;
  closed: boolean;
  slots: StadiumTimeSlot[];
};

export type StadiumAvailabilityBlock = {
  id: string;
  specific_date: string;
  start_time: string;
  end_time: string;
  notes: string;
};

export function emptyStadiumWeekHours(): StadiumWeekHour[] {
  return stadiumWeekDays.map((day) => ({
    day_of_week: day.day,
    closed: false,
    slots: [{ start_time: "06:00", end_time: "22:00" }],
  }));
}

export function timeInputValue(value?: string | null) {
  const text = `${value ?? ""}`.trim();
  return text.length >= 5 ? text.slice(0, 5) : "06:00";
}

export function sortStadiumSlots(slots: StadiumTimeSlot[]): StadiumTimeSlot[] {
  return [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export function stadiumSlotsOverlap(a: StadiumTimeSlot, b: StadiumTimeSlot) {
  return a.start_time < b.end_time && b.start_time < a.end_time;
}

export function overlappingStadiumSlotsError(slots: StadiumTimeSlot[]): string | null {
  const sorted = sortStadiumSlots(slots);
  for (let index = 0; index < sorted.length; index += 1) {
    const slot = sorted[index];
    if (slot.start_time >= slot.end_time) {
      return "End time must be after start time";
    }
    if (index > 0 && stadiumSlotsOverlap(sorted[index - 1], slot)) {
      return `Slots overlap: ${sorted[index - 1].start_time}–${sorted[index - 1].end_time} and ${slot.start_time}–${slot.end_time}`;
    }
  }
  return null;
}

export function normalizeStadiumWeekHours(
  input?: Array<
    Partial<StadiumWeekHour> & {
      start_time?: string;
      end_time?: string;
      is_blocked?: boolean;
    }
  > | null,
): StadiumWeekHour[] {
  const weekly = emptyStadiumWeekHours();
  if (!input?.length) return weekly;

  for (const day of weekly) {
    const matches = input.filter((item) => item.day_of_week === day.day_of_week);
    if (!matches.length) continue;
    const slots: StadiumTimeSlot[] = [];
    let closed = false;
    for (const item of matches) {
      const itemClosed = item.closed === true || item.is_blocked === true;
      if (Array.isArray(item.slots) && item.slots.length > 0) {
        for (const slot of item.slots) {
          slots.push({
            start_time: timeInputValue(slot.start_time),
            end_time: timeInputValue(slot.end_time),
          });
        }
        continue;
      }
      if (itemClosed) {
        closed = true;
        continue;
      }
      if (item.start_time && item.end_time) {
        slots.push({
          start_time: timeInputValue(item.start_time),
          end_time: timeInputValue(item.end_time),
        });
      }
    }
    if (slots.length > 0) {
      day.closed = false;
      day.slots = sortStadiumSlots(slots);
    } else {
      day.closed = closed;
      day.slots = [];
    }
  }
  return weekly;
}
