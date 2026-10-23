/**
 * Addis Ababa administrative divisions (11 sub-cities).
 *
 * Wereda counts follow the City Administration / AACRSSA references:
 * Sabiet AACA woreda table for the ten older sub-cities, and AACRSSA
 * for Lemi Kura (Woreda 1–14). Weredas are numbered within each sub-city.
 */
export type AddisAbabaSubcity = {
  /** Stable slug used in filters / storage helpers */
  id: string;
  /** Canonical English display name stored on stadiums.subcity */
  name: string;
  /** Alternate English spellings for search matching */
  aliases: string[];
  /** Number of weredas (districts) in this sub-city */
  weredaCount: number;
};

export const ADDIS_ABABA_SUBCITIES: readonly AddisAbabaSubcity[] = [
  {
    id: "addis-ketema",
    name: "Addis Ketema",
    aliases: ["addis ketema"],
    weredaCount: 12,
  },
  {
    id: "akaki-kality",
    name: "Akaki Kality",
    aliases: ["akaki kality", "akaki kaliti", "kaliti"],
    weredaCount: 13,
  },
  {
    id: "arada",
    name: "Arada",
    aliases: ["arada"],
    weredaCount: 8,
  },
  {
    id: "bole",
    name: "Bole",
    aliases: ["bole"],
    weredaCount: 11,
  },
  {
    id: "gulele",
    name: "Gulele",
    aliases: ["gulele", "gullele"],
    weredaCount: 10,
  },
  {
    id: "kirkos",
    name: "Kirkos",
    aliases: ["kirkos", "kerkos"],
    weredaCount: 10,
  },
  {
    id: "kolfe-keranio",
    name: "Kolfe Keranio",
    aliases: ["kolfe keranio", "kolfe keraniyo", "kolfe"],
    weredaCount: 11,
  },
  {
    id: "lideta",
    name: "Lideta",
    aliases: ["lideta", "ledeta"],
    weredaCount: 10,
  },
  {
    id: "nifas-silk-lafto",
    name: "Nifas Silk-Lafto",
    aliases: ["nifas silk-lafto", "nifas silk lafto", "nefas silk", "lafto"],
    weredaCount: 13,
  },
  {
    id: "yeka",
    name: "Yeka",
    aliases: ["yeka"],
    weredaCount: 12,
  },
  {
    id: "lemi-kura",
    name: "Lemi Kura",
    aliases: ["lemi kura"],
    weredaCount: 14,
  },
] as const;

export function addisSubcityByName(name: string | null | undefined) {
  const needle = (name ?? "").trim().toLowerCase();
  if (!needle) return null;
  return (
    ADDIS_ABABA_SUBCITIES.find(
      (s) =>
        s.name.toLowerCase() === needle ||
        s.id === needle ||
        s.aliases.some((a) => a.toLowerCase() === needle),
    ) ?? null
  );
}

export function addisSubcityOptions(query = "") {
  const q = query.trim().toLowerCase();
  if (!q) return [...ADDIS_ABABA_SUBCITIES];
  return ADDIS_ABABA_SUBCITIES.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.id.includes(q) ||
      s.aliases.some((a) => a.toLowerCase().includes(q)),
  );
}

export function weredaOptionsForSubcity(subcityName: string | null | undefined) {
  const sub = addisSubcityByName(subcityName);
  const count = sub?.weredaCount ?? 0;
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      value: String(n),
      label: `Woreda ${n}`,
      searchText: `woreda ${n} wereda ${n} w${n}`,
    };
  });
}

export function formatStadiumArea(subcity?: string | null, wereda?: number | null) {
  const city = (subcity ?? "").trim();
  if (!city) return "";
  if (wereda != null && Number.isFinite(wereda) && wereda > 0) {
    return `${city} · Woreda ${wereda}`;
  }
  return city;
}

export function normalizeWereda(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/\D+/g, ""));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}
