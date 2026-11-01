/** Profile Configuration (catalog) document — mirrors the backend admin document shape. */

import { adminFetch } from "@/lib/hooks";

export type CatalogStatus = "active" | "archived";

export type CatalogOption = {
  id: string;
  value: string;
  label: string;
  sort_order: number;
  status: CatalogStatus;
};

export type CatalogScopeKind = "account" | "fan" | "athlete" | "professional" | "sport" | "profession";

/** Group storage: which table holds the records. Career / achievement are single system groups. */
export type CatalogGroupStorage = "career" | "achievement" | "entry";

export type CatalogField = {
  id: string;
  key: string;
  scope_kind: CatalogScopeKind;
  scope_ref: string | null;
  /** "profile" for single values; record fields use their group's storage ("entry" for new ones). */
  target: string;
  /** Repeatable group key, or null for a single-value field. */
  group: string | null;
  /** Tab the field is shown on (for group fields: the group's tab). */
  section: string | null;
  label: string;
  help_text: string;
  /** Shown inside empty inputs on mobile; stored in validation.placeholder when published. */
  placeholder?: string;
  input_type: string;
  is_required: boolean;
  validation: Record<string, unknown>;
  sort_order: number;
  visibility: "public" | "members" | "private";
  editable_by: "owner" | "admin";
  storage_column: string | null;
  legacy_column: string | null;
  is_system: boolean;
  status: CatalogStatus;
  replaced_by_id: string | null;
  options: CatalogOption[];
};

export type CatalogSport = {
  id: string;
  slug: string;
  label: string;
  profile_title: string;
  description: string;
  sort_order: number;
  status: CatalogStatus;
};

export type CatalogProfession = CatalogSport & {
  license_label: string;
  default_service_category_slug: string;
};

/** A profile tab. */
export type CatalogSection = {
  id: string;
  key: string;
  label: string;
  description: string;
  /** Rendering hint only (icon / older apps). */
  kind: string;
  /** Account roles that see the tab. */
  roles: string[];
  /** Optional narrowing: "sport:<slug>" / "profession:<slug>". Empty = everyone in the roles. */
  categories: string[];
  sort_order: number;
  status: CatalogStatus;
};

/** A repeatable record group on a tab (Career entries, Highlights, Highlight reels, …). */
export type CatalogGroup = {
  id: string;
  key: string;
  section: string;
  label: string;
  item_label: string;
  description: string;
  scope_kind: CatalogScopeKind;
  scope_ref: string | null;
  storage: CatalogGroupStorage;
  max_items: number | null;
  sort_order: number;
  status: CatalogStatus;
};

export type CatalogMetric = {
  id: string;
  sport: string;
  key: string;
  label: string;
  value_type: "integer" | "decimal" | "duration";
  unit: string;
  precision: number;
  format: string;
  min_value: number | null;
  max_value: number | null;
  lower_is_better: boolean;
  applies_when: { field?: string; in?: string[] };
  show_on_profile: boolean;
  show_on_career: boolean;
  sort_order: number;
  legacy_column: string | null;
  status: CatalogStatus;
};

export type CatalogRequirement = {
  id: string;
  role_slug: string;
  sport: string | null;
  document: string;
  document_label?: string;
  is_required: boolean;
  description: string;
  sort_order: number;
};

export type CatalogDocument = {
  schema_version: number;
  version?: number;
  sports: CatalogSport[];
  professions: CatalogProfession[];
  sections: CatalogSection[];
  groups: CatalogGroup[];
  fields: CatalogField[];
  metrics: CatalogMetric[];
  verification_requirements: CatalogRequirement[];
};

export type CatalogIssue = { path: string; code: string; message: string };

export type CatalogChange = {
  kind: string;
  id: string;
  name: string;
  change: string;
  usage: number;
  newly_required?: boolean;
  note?: string;
  fields_changed?: string[];
};

export type CatalogCheck = {
  ok: boolean;
  errors: CatalogIssue[];
  warnings: CatalogIssue[];
  impact: { changes: CatalogChange[]; change_count: number; profiles_needing_update: number };
  live_version: number;
};

export type CatalogVersionRow = {
  id: string;
  version: number | null;
  base_version: number | null;
  status: "draft" | "published" | "superseded" | "discarded";
  /** Admin-facing version title (stored as notes). */
  title?: string;
  notes: string;
  change_count?: number;
  impact?: { changes?: CatalogChange[]; change_count?: number };
  updated_at: string | null;
  published_at: string | null;
  created_at?: string | null;
  document?: CatalogDocument;
  validation?: { errors?: CatalogIssue[]; warnings?: CatalogIssue[] };
};

export type CatalogVersionDetail = CatalogVersionRow & {
  diff: { changes: CatalogChange[]; change_count: number };
  compared_to: {
    id: string;
    version: number | null;
    title: string;
    status: string;
    label: string;
  } | null;
};

export type CatalogOverview = {
  live: CatalogDocument & { version: number };
  usage: Record<string, number>;
  versions: CatalogVersionRow[];
  min_client_schema_version: number;
  input_types: Record<string, number>;
  group_storages: CatalogGroupStorage[];
  document_types: { slug: string; label: string; is_active: boolean }[];
};

export const INPUT_TYPE_LABELS: Record<string, string> = {
  text: "Short text",
  multiline: "Long text",
  integer: "Whole number",
  decimal: "Decimal number",
  single_select: "Single choice",
  multi_select: "Multiple choice",
  date: "Date",
  boolean: "Yes / no",
  url: "Web link",
  file: "File (private document)",
  image: "Image",
  video: "Video",
};

export const SECTION_KINDS = ["attributes", "career", "achievements", "media", "portfolio"] as const;

export const SCOPE_LABELS: Record<string, string> = {
  account: "Everyone",
  fan: "Fans",
  athlete: "All athletes",
  professional: "All professionals",
};

/** "account" | role | "sport:<slug>" | "profession:<slug>" — one select value per audience. */
export function scopeValue(row: { scope_kind: string; scope_ref: string | null }) {
  return row.scope_ref ? `${row.scope_kind}:${row.scope_ref}` : row.scope_kind;
}

export function parseScope(value: string): { scope_kind: CatalogScopeKind; scope_ref: string | null } {
  const [kind, ref] = value.split(":");
  return { scope_kind: kind as CatalogScopeKind, scope_ref: ref || null };
}

/** Field target for a new field: single values are "profile"; record fields follow the group's storage. */
export function targetForStorage(storage: CatalogGroupStorage | null | undefined) {
  return storage ?? "profile";
}

/**
 * Whether someone with [audience] ("all", a role, or "sport:x" / "profession:x") sees a
 * row scoped [row]. Mirrors the backend audience rule (account → role → category).
 */
export function scopeReaches(row: { scope_kind: string; scope_ref: string | null }, audience: string) {
  if (audience === "all") return true;
  const [kind, ref] = audience.split(":");
  const role = kind === "sport" ? "athlete" : kind === "profession" ? "professional" : kind;
  if (row.scope_kind === "account") return true;
  if (row.scope_kind === "fan" || row.scope_kind === "athlete" || row.scope_kind === "professional") {
    return row.scope_kind === role;
  }
  return row.scope_kind === kind && row.scope_ref === ref;
}

/** Whether a tab is shown to [audience]. */
export function tabReaches(section: CatalogSection, audience: string) {
  if (audience === "all") return true;
  const [kind] = audience.split(":");
  const role = kind === "sport" ? "athlete" : kind === "profession" ? "professional" : kind;
  if (!section.roles.includes(role)) return false;
  if (!section.categories?.length || !audience.includes(":")) return true;
  return section.categories.includes(audience);
}

export function newId() {
  return crypto.randomUUID();
}

export function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1")
    .slice(0, 60);
}

/** Option values allow hyphens/digits first (e.g. "100m"). */
export function optionValue(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export async function catalogRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await adminFetch(`/api/admin/profile-catalog${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: string;
    code?: string;
    detail?: unknown;
  };
  if (!response.ok) {
    const err = new Error(payload.error || "Request failed") as Error & { code?: string; detail?: unknown };
    err.code = payload.code;
    err.detail = payload.detail;
    throw err;
  }
  return payload.data as T;
}
