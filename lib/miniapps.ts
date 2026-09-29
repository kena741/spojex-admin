export const miniAppCategories = [
  "Services",
  "Clubs",
  "Tickets",
  "Training",
  "Impact",
  "Media",
] as const;

export function slugifyMiniApp(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeHttpsUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}
