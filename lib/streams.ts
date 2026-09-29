export type StreamStatus = "active" | "inactive";

export const streamStatuses: { id: StreamStatus; label: string }[] = [
  { id: "active", label: "On air" },
  { id: "inactive", label: "Off air" },
];

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
  return streamStatuses.find((item) => item.id === status)?.label ?? status ?? "—";
}

export function slugifyStream(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
