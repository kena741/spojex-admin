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

export type CatalogField = {
  id: string;
  key: string;
  scope_kind: "account" | "fan" | "athlete" | "professional" | "sport" | "profession";
  scope_ref: string | null;
  target: "profile" | "career" | "achievement";
  section: string | null;
  label: string;
  help_text: string;
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

export type CatalogSection = {
  id: string;
  key: string;
  label: string;
  description: string;
  kind: "attributes" | "career" | "achievements" | "performance" | "portfolio";
  roles: string[];
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
  notes: string;
  updated_at: string | null;
  published_at: string | null;
  document?: CatalogDocument;
  validation?: { errors?: CatalogIssue[]; warnings?: CatalogIssue[] };
};

export type CatalogOverview = {
  live: CatalogDocument & { version: number };
  usage: Record<string, number>;
  versions: CatalogVersionRow[];
  min_client_schema_version: number;
  input_types: Record<string, number>;
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
};

export const SCOPE_LABELS: Record<string, string> = {
  account: "Everyone (account)",
  fan: "Fans",
  athlete: "All athletes",
  professional: "All professionals",
};

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
