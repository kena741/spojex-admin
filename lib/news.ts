export type NewsStatus = "draft" | "active" | "archived";

export const newsStatuses: { id: NewsStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "active", label: "Published" },
  { id: "archived", label: "Archived" },
];

/** Normalize overview/drill-down aliases: published → active. */
export function normalizeNewsStatusFilter(raw?: string | null): NewsStatus | "all" {
  const value = String(raw || "").trim().toLowerCase();
  if (!value || value === "all") return "all";
  if (value === "published") return "active";
  if (value === "draft" || value === "active" || value === "archived") return value;
  return "all";
}

export function newsStatusMatches(rowStatus: string | null | undefined, filter: string) {
  if (!filter || filter === "all") return true;
  const row = String(rowStatus || "").toLowerCase();
  const want = normalizeNewsStatusFilter(filter);
  if (want === "all") return true;
  if (want === "active") return row === "active" || row === "published";
  return row === want;
}

export const newsCategories = [
  "General",
  "Local",
  "Premier League",
  "Academy",
  "Transfers",
  "International",
] as const;

export function newsStatusLabel(status?: string | null) {
  return newsStatuses.find((item) => item.id === status)?.label ?? status ?? "—";
}

export function slugifyNews(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Newest published stories first. Drafts fall back to when they were created. */
export function newsRecency(row: { published_at?: string | null; created_at?: string | null }) {
  const value = row.published_at || row.created_at || "";
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
