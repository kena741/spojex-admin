const STORAGE_KEY = "spojex.admin.recentNewsSources";
const MAX_RECENT = 8;

function normalize(source: string) {
  return source.trim().replace(/\s+/g, " ");
}

function readStored(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === "string" ? normalize(item) : ""))
      .filter(Boolean)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function writeStored(sources: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources.slice(0, MAX_RECENT)));
  } catch {
    // ignore quota / private mode
  }
}

/** Persist a source as most-recently used. */
export function rememberNewsSource(source: string) {
  const next = normalize(source);
  if (!next) return;
  const existing = readStored().filter((item) => item.toLowerCase() !== next.toLowerCase());
  writeStored([next, ...existing]);
}

export function loadRememberedNewsSources(): string[] {
  return readStored();
}

/**
 * Unique sources ordered by recency: remembered picks first, then from news rows
 * (assumed newest-first).
 */
export function collectRecentNewsSources(
  rows: Array<{ source?: string | null }>,
  extras: string[] = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: string | null | undefined) => {
    const value = normalize(raw ?? "");
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  };

  for (const item of extras) push(item);
  for (const item of loadRememberedNewsSources()) push(item);
  for (const row of rows) push(row.source);

  return out.slice(0, MAX_RECENT);
}
