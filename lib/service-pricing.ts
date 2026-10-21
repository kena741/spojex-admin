/** Shared marketplace listing labels (admin directory, detail, editor). */

export const PRICING_TYPES = [
  { id: "fixed", label: "Fixed" },
  { id: "starting", label: "Starting from" },
  { id: "hourly", label: "Hourly" },
  { id: "per_session", label: "Per session" },
  { id: "per_day", label: "Per day" },
  { id: "monthly", label: "Monthly" },
  { id: "custom_quote", label: "Custom quote" },
  { id: "free", label: "Free" },
] as const;

/** Canonical delivery modes. Legacy values (e.g. on_request) are preserved, not remapped. */
export const DELIVERY_MODES = [
  { id: "in_person", label: "In person" },
  { id: "online", label: "Online" },
  { id: "both", label: "In person & online" },
] as const;

export function formatServicePrice(row: {
  pricing_type?: string | null;
  price_amount?: number | string | null;
  currency?: string | null;
  price_label?: string | null;
}): string {
  if (row.price_label) return row.price_label;
  const pt = String(row.pricing_type || "").toLowerCase();
  const cur = (row.currency || "ETB").toUpperCase();
  if (pt === "free") return "Free";
  if (pt === "custom_quote" || pt === "quote" || pt === "custom") return "Request quote";
  if (row.price_amount == null || row.price_amount === "") {
    return pt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
  }
  const n = Number(row.price_amount);
  const pretty = `${cur} ${n.toLocaleString("en-ET", { maximumFractionDigits: 2 })}`;
  if (pt === "starting") return `From ${pretty}`;
  if (pt === "hourly") return `${pretty}/hour`;
  if (pt === "per_session") return `${pretty}/session`;
  if (pt === "per_day") return `${pretty}/day`;
  if (pt === "monthly" || pt === "recurring_monthly" || pt === "per_month") {
    return `${pretty}/month`;
  }
  return pretty;
}

export function formatRating(avg: number | null | undefined, count: number | null | undefined) {
  const reviews = Number(count ?? 0);
  if (!reviews || avg == null) return "No ratings yet";
  return `${Number(avg).toFixed(1)} · ${reviews} review${reviews === 1 ? "" : "s"}`;
}

export function formatDuration(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return null;
  const m = Number(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/**
 * Display-only delivery labels.
 * `on_request` is a legacy outlier — shown as "On request", never coerced to
 * In person / Online / Custom quote. Stored value must be preserved until migration.
 */
export function formatDelivery(mode: string | null | undefined) {
  const m = String(mode || "").toLowerCase();
  if (m === "in_person") return "In person";
  if (m === "online") return "Online";
  if (m === "both") return "In person & online";
  if (m === "on_request") return "On request";
  if (!m) return "—";
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Approval and publication share `published`. Approve publishes immediately. */
export function formatPublicationStatus(published: boolean | null | undefined) {
  return published ? "Published" : "Pending review";
}

export function publicationTone(published: boolean | null | undefined): "approved" | "pending" {
  return published ? "approved" : "pending";
}

export function providerVerificationLabel(verified: boolean | null | undefined) {
  return verified ? "Identity verified" : "Identity not verified";
}

export const PROVIDER_VERIFICATION_NOTE =
  "Profile identity verification only — not a professional credential or license.";

export function bookingPaymentLabel(
  paymentStatus: string | null | undefined,
  pricingType: string | null | undefined,
): string {
  const pt = String(pricingType || "").toLowerCase();
  const freeOrQuote = pt === "free" || pt === "custom_quote" || pt === "quote" || pt === "custom";
  const s = String(paymentStatus || "").trim().toLowerCase();
  if (freeOrQuote && (!s || s === "none" || s === "null")) return "Not required";
  if (!s || s === "none" || s === "null") {
    return freeOrQuote ? "Not required" : "Awaiting payment";
  }
  if (["completed", "paid", "success", "verified"].includes(s)) return "Verified";
  if (["pending", "processing", "initiated"].includes(s)) return "Awaiting payment";
  if (s === "failed") return "Failed";
  if (s === "refunded") return "Refunded";
  if (s === "partial_refund") return "Partially refunded";
  if (s === "cancelled" || s === "canceled") return "Cancelled";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function validateServiceDraft(draft: {
  title?: string;
  description?: string;
  pricing_type?: string;
  price_amount?: string | number | null;
  duration_minutes?: string | number | null;
  availability_mode?: string;
}): string | null {
  const title = String(draft.title || "").trim();
  if (!title) return "Title is required";
  if (title.length > 120) return "Title must be at most 120 characters";
  if (String(draft.description || "").length > 8000) {
    return "Description must be at most 8000 characters";
  }
  const pt = String(draft.pricing_type || "").toLowerCase();
  const needsAmount = ["fixed", "starting", "hourly", "per_session", "per_day", "monthly"].includes(pt);
  if (needsAmount) {
    const n = Number(draft.price_amount);
    if (!Number.isFinite(n) || n < 0) return "A nonnegative price is required for this pricing type";
  }
  if (draft.duration_minutes != null && String(draft.duration_minutes).trim() !== "") {
    const d = Number(draft.duration_minutes);
    if (!Number.isFinite(d) || d < 5 || d > 24 * 60) {
      return "Duration must be between 5 and 1440 minutes";
    }
  }
  return null;
}
