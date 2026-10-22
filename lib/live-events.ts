export const liveEventKinds = [
  { id: "stream", label: "Stream" },
  { id: "football", label: "Football match" },
  { id: "basketball", label: "Basketball" },
  { id: "fight", label: "Fight / Boxing" },
  { id: "radio", label: "Radio" },
  { id: "concert", label: "Concert / Show" },
  { id: "other", label: "Other" },
] as const;

export const liveEventStatuses = [
  { id: "scheduled", label: "Scheduled" },
  { id: "live", label: "Live" },
  { id: "suspended", label: "Paused" },
  { id: "postponed", label: "Postponed" },
  { id: "finished", label: "Finished" },
  { id: "cancelled", label: "Cancelled" },
] as const;

export const liveStreamKinds = [
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio / radio" },
] as const;

/**
 * Playback source types stored on live_events.source_type.
 * - external_url: a hosted HLS/MP4/audio URL we simply play back.
 * - ingest: broadcaster pushes to Spojex — NOT available yet (backend rejects it).
 * - mock_dev: public sample files for testing only.
 */
export const liveSourceTypes = [
  { id: "external_url", label: "External URL", devOnly: false, supported: true },
  { id: "ingest", label: "Broadcaster ingest (not available yet)", devOnly: false, supported: false },
  { id: "mock_dev", label: "Mock / dev sample (testing only)", devOnly: true, supported: true },
] as const;

export const liveVisibilities = [
  { id: "public", label: "Public" },
  { id: "unlisted", label: "Unlisted" },
  { id: "private", label: "Private" },
] as const;

export const liveTimezones = [
  "Africa/Addis_Ababa",
  "Africa/Nairobi",
  "UTC",
  "Europe/London",
  "America/New_York",
] as const;

export const matchPeriods = ["", "1H", "HT", "2H", "ET", "FT"];

export const liveEventKindIds = new Set<string>(liveEventKinds.map((item) => item.id));
export const liveEventStatusIds = new Set<string>(liveEventStatuses.map((item) => item.id));
export const liveStreamKindIds = new Set<string>(liveStreamKinds.map((item) => item.id));

export function isScoreKind(kind?: string | null) {
  return kind === "football" || kind === "basketball";
}

export function isFightKind(kind?: string | null) {
  return kind === "fight";
}

export function defaultStreamKind(kind?: string | null) {
  return kind === "radio" ? "audio" : "video";
}

/** Public sample files the Flutter player can open without a live encoder. */
export const mockLiveStreams = [
  {
    id: "video",
    label: "Mock video",
    stream_kind: "video",
    // Google’s old gtv-videos-bucket samples now 403; use Flutter’s public MP4.
    url: "https://flutter.github.io/assets-for-api-docs/assets/videos/bee.mp4",
  },
  {
    id: "audio",
    label: "Mock audio",
    stream_kind: "audio",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  },
] as const;

export function mockLiveStream(id: "video" | "audio") {
  return mockLiveStreams.find((item) => item.id === id) ?? mockLiveStreams[0];
}

export function liveKindLabel(kind?: string | null) {
  return liveEventKinds.find((item) => item.id === kind)?.label ?? kind ?? "—";
}

export function liveStatusLabel(status?: string | null) {
  return liveEventStatuses.find((item) => item.id === status)?.label ?? status ?? "—";
}

export function slugifyLiveEvent(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function formatRoundClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function parseRoundClock(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (/^\d+$/.test(trimmed)) return Math.max(0, Number(trimmed));
  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return 0;
  return Math.max(0, Number(match[1]) * 60 + Number(match[2]));
}

export function canManageLiveEvents(can: (permission: string) => boolean) {
  return can("events:read") || can("streams:read");
}

export function canWriteLiveEvents(can: (permission: string) => boolean) {
  return can("events:write") || can("streams:write");
}

export function liveEventAppRoute(id: string) {
  return `/hub/media/live/${id}`;
}

export function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function asInt(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function liveSourceTypeLabel(type?: string | null) {
  const key = type || "external_url";
  return liveSourceTypes.find((item) => item.id === key)?.label ?? key;
}

export function liveVisibilityLabel(value?: string | null) {
  return liveVisibilities.find((item) => item.id === (value || "public"))?.label ?? value ?? "Public";
}

/** Mock sources are only offered in `next dev`, or when the admin opts in explicitly. */
export const isDevelopmentBuild = process.env.NODE_ENV === "development";

/** Preferred URL value for the Live Events tab (legacy links use `tab=video`). */
export const STREAMS_LIVE_TAB = "live";
export const STREAMS_LIVE_HREF = `/admin/streams?tab=${STREAMS_LIVE_TAB}`;

/** Human countdown for a scheduled broadcast; never implies the event is live. */
export function formatCountdown(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  if (seconds <= 0) return "Start time reached — not live until an admin goes live";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `Starts in ${days}d ${hours}h`;
  if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
  return `Starts in ${Math.max(minutes, 1)}m`;
}

export type LiveLifecycleAction = {
  id: "go_live" | "pause" | "postpone" | "finish" | "cancel" | "reschedule";
  target: string;
  label: string;
  reasonRequired: boolean;
  tone?: "default" | "danger" | "success";
};

export const liveLifecycleActions: LiveLifecycleAction[] = [
  { id: "go_live", target: "live", label: "Go live", reasonRequired: false, tone: "success" },
  { id: "pause", target: "suspended", label: "Pause", reasonRequired: true },
  { id: "postpone", target: "postponed", label: "Postpone", reasonRequired: true },
  { id: "finish", target: "finished", label: "Finish", reasonRequired: false },
  { id: "reschedule", target: "scheduled", label: "Back to scheduled", reasonRequired: false },
  { id: "cancel", target: "cancelled", label: "Cancel event", reasonRequired: true, tone: "danger" },
];

/** Mirrors the backend transition table; workspace.lifecycle.allowed_transitions wins when present. */
export const liveStatusTransitions: Record<string, string[]> = {
  scheduled: ["live", "postponed", "cancelled"],
  live: ["suspended", "finished", "cancelled"],
  suspended: ["live", "finished", "cancelled", "postponed"],
  postponed: ["scheduled", "live", "cancelled"],
  finished: [],
  cancelled: [],
};

export function allowedLifecycleActions(status?: string | null, transitions?: string[] | null) {
  const targets =
    transitions && transitions.length > 0 ? transitions : (liveStatusTransitions[status ?? ""] ?? []);
  return liveLifecycleActions
    .filter((action) => targets.includes(action.target))
    .map((action) =>
      action.id === "go_live" && status === "suspended"
        ? { ...action, label: "Resume live" }
        : action,
    );
}

function zoneOffsetMs(timestamp: number, timeZone: string) {
  const whole = Math.floor(timestamp / 1000) * 1000;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(whole));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - whole;
}

/** "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone` → UTC ISO string. */
export function zonedLocalToIso(local: string, timeZone: string): string | null {
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  try {
    const first = zoneOffsetMs(guess, timeZone);
    let result = guess - first;
    const second = zoneOffsetMs(result, timeZone);
    if (second !== first) result = guess - second;
    return new Date(result).toISOString();
  } catch {
    return null;
  }
}

/** UTC ISO string → "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone`. */
export function isoToZonedLocal(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    return "";
  }
}
