export type StreamStatus = "active" | "inactive";

export const streamStatuses: { id: StreamStatus; label: string }[] = [
  { id: "active", label: "On air" },
  { id: "inactive", label: "Off air" },
];

export const streamHealthStatuses = [
  { id: "unknown", label: "Health unknown" },
  { id: "reachable", label: "Endpoint reachable" },
  { id: "unreachable", label: "Unreachable" },
  { id: "invalid_url", label: "Invalid URL" },
] as const;

export const streamGenres = [
  "Live radio",
  "Web radio",
  "News & talk",
  "News",
  "Sports",
  "Music",
  "Talk",
  "Culture",
  "Regional",
] as const;

export function streamPlaybackUrl(row: { stream_url?: string | null; website_url?: string | null }) {
  return (row.stream_url ?? "").trim() || (row.website_url ?? "").trim();
}

export function streamStatusLabel(status?: string | null) {
  return streamStatuses.find((item) => item.id === status)?.label ?? status ?? "-";
}

export function streamHealthLabel(status?: string | null) {
  return (
    streamHealthStatuses.find((item) => item.id === status)?.label ?? status ?? "Health unknown"
  );
}

export function slugifyStream(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Client-side shape check only - server validates SSRF / DNS. */
export function looksLikeStreamUrl(url: string) {
  const raw = url.trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export type StreamHealthTone = "success" | "warning" | "danger" | "neutral";

export function streamHealthTone(status?: string | null): StreamHealthTone {
  switch (status) {
    case "reachable":
      return "success";
    case "unreachable":
    case "invalid_url":
      return "danger";
    default:
      return "neutral";
  }
}
