export type CareerEntry = {
  id?: string;
  entry_type?: string;
  organization?: { name?: string; short_name?: string };
  role?: { title?: string; league_or_competition?: string };
  location?: { city?: string; country?: string };
  period?: { start_date?: string | null; end_date?: string | null; is_current?: boolean };
  stats?: { matches_played?: number; goals?: number; assists?: number };
  honours?: string[];
  summary?: string;
  sort_order?: number;
};

export type AchievementEntry = {
  id?: string;
  title?: string;
  category?: string;
  year?: number | null;
  organization?: string;
  summary?: string;
};

export type JsonDoc<T> = {
  version?: number;
  updated_at?: string;
  entries?: T[];
};

export function parseCareerHistory(value: unknown): CareerEntry[] {
  if (!value || typeof value !== "object") return [];
  const doc = value as JsonDoc<CareerEntry>;
  if (!Array.isArray(doc.entries)) return [];
  return [...doc.entries].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0));
}

export function parseAchievements(value: unknown): AchievementEntry[] {
  if (!value || typeof value !== "object") return [];
  const doc = value as JsonDoc<AchievementEntry>;
  return Array.isArray(doc.entries) ? doc.entries : [];
}

export function careerEntryLabel(entry: CareerEntry) {
  const org = entry.organization?.name || "Unknown organization";
  const role = entry.role?.title;
  return role ? `${org} · ${role}` : org;
}

export function careerPeriodLabel(entry: CareerEntry) {
  const start = entry.period?.start_date ?? "—";
  const end = entry.period?.is_current ? "Present" : entry.period?.end_date ?? "—";
  return `${start} → ${end}`;
}

export function formatEntryType(value?: string) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
