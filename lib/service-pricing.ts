/** Marketplace listing price labels. */

export function formatServicePrice(row: {
  pricing_type?: string | null;
  price_amount?: number | string | null;
  currency?: string | null;
}): string {
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

export function formatDelivery(mode: string | null | undefined) {
  const m = String(mode || "").toLowerCase();
  if (m === "in_person") return "In person";
  if (m === "online") return "Online";
  if (m === "both") return "In person & online";
  return mode || "—";
}
