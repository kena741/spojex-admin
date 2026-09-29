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
