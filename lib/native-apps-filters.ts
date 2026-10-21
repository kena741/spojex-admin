/**
 * Shared Native Apps overview ↔ directory filter contract.
 * Keep in sync with spojex_backend admin_native_apps filter constants.
 */

export const NATIVE_APPS_TZ = "Africa/Addis_Ababa";

/** Gym verification queue counted by overview attention + pending_verification metric. */
export const GYM_VERIFICATION_QUEUE = ["pending", "under_review"] as const;

/** Stadium statuses counted as pending approvals. */
export const STADIUM_PENDING_APPROVAL = ["pending"] as const;

/** Stadium statuses counted as active venues. */
export const STADIUM_ACTIVE = ["active"] as const;

/** Event lifecycles excluded from "upcoming" windows. */
export const EVENT_UPCOMING_EXCLUDED_LIFECYCLES = [
  "cancelled",
  "canceled",
  "ended",
  "completed",
] as const;

/** Radio station "enabled configuration" (not playback health). */
export const RADIO_ENABLED = ["active"] as const;

/** Confirmed live video session statuses. */
export const VIDEO_LIVE_CONFIRMED = ["live"] as const;

/** Scheduled (not yet live) video sessions. */
export const VIDEO_SCHEDULED = ["scheduled"] as const;

export function gymsHref(parts: {
  verification?: string;
  featured?: string;
  status?: string;
}): string {
  const params = new URLSearchParams();
  if (parts.verification) params.set("verification", parts.verification);
  if (parts.featured) params.set("featured", parts.featured);
  if (parts.status) params.set("status", parts.status);
  const qs = params.toString();
  return qs ? `/admin/gyms?${qs}` : "/admin/gyms";
}

export function stadiumsHref(parts: { status?: string }): string {
  const params = new URLSearchParams();
  if (parts.status) params.set("status", parts.status);
  const qs = params.toString();
  return qs ? `/admin/stadiums?${qs}` : "/admin/stadiums";
}

export function eventsHref(parts: {
  lifecycle?: string;
  starts_from?: string;
  starts_to?: string;
  window?: string;
  status?: string;
}): string {
  const params = new URLSearchParams();
  if (parts.lifecycle) params.set("lifecycle", parts.lifecycle);
  if (parts.starts_from) params.set("starts_from", parts.starts_from);
  if (parts.starts_to) params.set("starts_to", parts.starts_to);
  if (parts.window) params.set("window", parts.window);
  if (parts.status) params.set("status", parts.status);
  const qs = params.toString();
  return qs ? `/admin/events?${qs}` : "/admin/events";
}

export function donationsHref(parts: { status?: string; closing_soon?: string }): string {
  const params = new URLSearchParams();
  if (parts.status) params.set("status", parts.status);
  if (parts.closing_soon) params.set("closing_soon", parts.closing_soon);
  const qs = params.toString();
  return qs ? `/admin/donations?${qs}` : "/admin/donations";
}

export function streamsHref(parts: {
  tab?: "radio" | "video";
  status?: string;
}): string {
  const params = new URLSearchParams();
  if (parts.tab) params.set("tab", parts.tab);
  if (parts.status) params.set("status", parts.status);
  const qs = params.toString();
  return qs ? `/admin/streams?${qs}` : "/admin/streams";
}

/** Match gym directory filter: `queue` = pending + under_review. */
export function gymVerificationMatches(
  rowStatus: string | null | undefined,
  filter: string,
): boolean {
  if (!filter || filter === "all") return true;
  const value = String(rowStatus || "").toLowerCase();
  if (filter === "queue") {
    return (GYM_VERIFICATION_QUEUE as readonly string[]).includes(value);
  }
  return value === filter.toLowerCase();
}
