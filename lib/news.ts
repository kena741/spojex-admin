export type NewsStatus = "draft" | "active" | "archived";

export const newsStatuses: { id: NewsStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "active", label: "Published" },
  { id: "archived", label: "Archived" },
];

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
