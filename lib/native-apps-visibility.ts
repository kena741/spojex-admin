/**
 * Native apps the admin can order and hide in the Spojex app, in default order.
 * Keys and order match the backend's NATIVE_APP_KEYS. The first
 * QUICK_ACTION_COUNT visible apps are home quick actions (plus the Apps button);
 * the rest are on the All apps page.
 */
export const NATIVE_APPS = [
  { key: "services", label: "Services" },
  { key: "stadiums", label: "Stadiums" },
  { key: "gyms", label: "Gyms" },
  { key: "awards", label: "Awards" },
  { key: "shop", label: "Marketplace" },
  { key: "events", label: "Events" },
  { key: "stream", label: "Stream" },
  { key: "donations", label: "Donations" },
  { key: "news", label: "News" },
] as const;

export const QUICK_ACTION_COUNT = 7;

const KEYS: readonly string[] = NATIVE_APPS.map((a) => a.key);

/** Known keys only, no duplicates. */
export function cleanKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const key = String(item).trim().toLowerCase();
    if (KEYS.includes(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Saved order, with any app missing from it appended in default order. */
export function fullOrder(raw: unknown): string[] {
  const order = cleanKeys(raw);
  return [...order, ...KEYS.filter((k) => !order.includes(k))];
}
