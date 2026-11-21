/** Catalog public/admin profile payload from GET /api/v1/profiles/{id}. */

export type CatalogProfileField = {
  id?: string;
  key?: string;
  label?: string;
  value?: unknown;
  display_value?: string | null;
  input_type?: string;
};

export type CatalogProfileGroup = {
  key?: string;
  label?: string;
  storage?: string;
  fields?: CatalogProfileField[];
  records?: Array<{
    id?: string;
    display_values?: Record<string, string>;
    values?: Record<string, unknown>;
    sort_order?: number;
  }>;
};

export type CatalogProfileTab = {
  key?: string;
  label?: string;
  kind?: string;
  fields?: CatalogProfileField[];
  groups?: CatalogProfileGroup[];
};

export type CatalogCareerEntry = {
  id?: string;
  organization_name?: string;
  organization_short_name?: string;
  role_title?: string;
  league_or_competition?: string;
  city?: string;
  country?: string;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  entry_type?: string;
  honours?: string[];
  summary?: string;
  sort_order?: number;
};

export type CatalogAchievement = {
  id?: string;
  title?: string;
  organization?: string;
  year?: number | null;
  category?: string;
  summary?: string;
};

export type CatalogProfileDocument = {
  role?: string;
  profile_title?: string;
  category?: { kind?: string; slug?: string; label?: string } | null;
  tabs?: CatalogProfileTab[];
  career?: CatalogCareerEntry[];
  achievements?: CatalogAchievement[];
  portfolio?: unknown[];
  performance?: Array<{
    key?: string;
    label?: string;
    display_value?: string | null;
    value?: unknown;
  }>;
};

export function catalogHasRoleContent(doc: CatalogProfileDocument | null | undefined): boolean {
  if (!doc) return false;
  const role = String(doc.role ?? "").toLowerCase();
  if (role === "athlete" || role === "professional") return true;
  const tabs = doc.tabs ?? [];
  if (tabs.some((t) => (t.fields?.length ?? 0) > 0 || (t.groups?.length ?? 0) > 0)) {
    return true;
  }
  return (doc.career?.length ?? 0) > 0 || (doc.achievements?.length ?? 0) > 0;
}

export function fieldDisplay(field: CatalogProfileField): string {
  const display = field.display_value;
  if (display != null && String(display).trim()) return String(display);
  const value = field.value;
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(", ") || "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
