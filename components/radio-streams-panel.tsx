"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminReloadButton,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  AdminTableLoading,
  AdminTableShell,
  type AdminRowMenuItem,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { adminFetch, deleteAdmin, postAdminResponse } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import {
  looksLikeStreamUrl,
  slugifyStream,
  streamGenres,
  streamHealthLabel,
  streamHealthStatuses,
  streamHealthTone,
  streamStatusLabel,
  streamStatuses,
} from "@/lib/streams";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { OrganizationRow, RadioStreamRow } from "@/lib/types";

type OrgOption = Pick<OrganizationRow, "id" | "name" | "public_id"> & { is_platform?: boolean | null };

type RadioListRow = RadioStreamRow & {
  organization?: {
    id?: string | null;
    name?: string | null;
    public_id?: string | null;
    owner_user_id?: string | null;
  } | null;
  publication?: { status?: string; enabled?: boolean; note?: string };
  playback_health?: { status?: string; checked_at?: string | null; message?: string };
  href?: string;
  chat_href?: string;
};

type ListPayload = {
  data?: RadioListRow[];
  total?: number;
  page?: number;
  page_size?: number;
  error?: string;
};

type ImportEntry = {
  name?: string;
  slug?: string;
  source_id?: string;
  reason?: string;
  stream_url?: string;
  existing_id?: string;
};

type ImportPreview = {
  create?: ImportEntry[];
  update?: ImportEntry[];
  duplicates?: ImportEntry[];
  missing_playback?: ImportEntry[];
  unmapped_metadata?: unknown[];
  policy?: { match?: string; preserve_local?: string[]; new_default_status?: string; note?: string };
};

type ImportPayload = {
  ok?: boolean;
  dry_run?: boolean;
  preview?: ImportPreview;
  created?: number;
  updated?: number;
  error?: string;
  message?: string;
} & ImportPreview;

const PAGE_SIZE = 40;
const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const sortOptions = [
  { id: "sort_order", label: "Display order" },
  { id: "name", label: "Name" },
  { id: "status", label: "Publication status" },
  { id: "health", label: "Playback health" },
  { id: "updated_at", label: "Recently updated" },
] as const;

function formatChecked(value?: string | null) {
  if (!value) return "Never checked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

type CreateForm = {
  name: string;
  stream_url: string;
  genre: string;
  city: string;
  host_org_id: string;
  status: string;
  tagline: string;
};

const emptyCreate: CreateForm = {
  name: "",
  stream_url: "",
  genre: "Live radio",
  city: "Addis Ababa",
  host_org_id: "",
  status: "inactive",
  tagline: "",
};

function RequiredLabel({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-text-primary">
        {label} <span className="text-red-600" aria-hidden>*</span>
        <span className="sr-only"> (required)</span>
      </span>
      {children}
      {error ? (
        <span className="text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="text-xs text-text-secondary">{hint}</span>
      ) : null}
    </label>
  );
}

function ImportCount({ label, count, tone }: { label: string; count: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${tone ?? ""}`}>{count}</p>
    </div>
  );
}

function ImportList({ title, items }: { title: string; items?: ImportEntry[] }) {
  if (!items || items.length === 0) return null;
  return (
    <details className="rounded-lg border border-border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">
        {title} ({items.length})
      </summary>
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-text-secondary">
        {items.slice(0, 100).map((item, index) => (
          <li key={`${item.source_id ?? item.name ?? "row"}-${index}`}>
            {item.name || item.source_id || "Unnamed"}
            {item.reason ? ` - ${item.reason}` : ""}
          </li>
        ))}
        {items.length > 100 ? <li>…and {items.length - 100} more</li> : null}
      </ul>
    </details>
  );
}

/** Radio station list - server-side filtering, health vs publication kept separate. */
export default function RadioStreamsPanel() {
  const { can } = useAdminPermissions();
  const canWrite = can("streams:write");

  const [rows, setRows] = useState<RadioListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [genre, setGenre] = useState("all");
  const [organization, setOrganization] = useState("");
  const [health, setHealth] = useState("all");
  const [featured, setFeatured] = useState("all");
  const [sort, setSort] = useState<string>("sort_order");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [createTouched, setCreateTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importApplying, setImportApplying] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportPayload | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(async () => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Any filter change returns to page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, status, genre, organization, health, featured, sort, order]);

  useEffect(() => {
    getSpojexClient()
      .from("organizations")
      .select("id, name, public_id, is_platform")
      .order("is_platform", { ascending: false })
      .order("name")
      .limit(500)
      .then(({ data, error: orgError }) => {
        if (!orgError) setOrgs((data ?? []) as OrgOption[]);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (status !== "all") params.set("status", status);
    if (genre !== "all") params.set("genre", genre);
    if (organization) params.set("organization", organization);
    if (health !== "all") params.set("health", health);
    if (featured !== "all") params.set("featured", featured);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    params.set("sort", sort);
    params.set("order", order);
    setLoading(true);
    adminFetch(`/api/admin/streams/radio?${params}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as ListPayload;
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || "Failed to load stations");
        setRows(payload.data ?? []);
        setTotal(payload.total ?? payload.data?.length ?? 0);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load stations");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, status, genre, organization, health, featured, sort, order, page, reloadKey]);

  const orgName = useCallback(
    (row: RadioListRow) =>
      row.organization?.name ??
      row.organizations?.name ??
      orgs.find((org) => org.id === row.host_org_id)?.name ??
      null,
    [orgs],
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const platformOrg = useMemo(() => orgs.find((org) => org.is_platform), [orgs]);

  const runRowAction = async (row: RadioListRow, action: string, doneLabel: string) => {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      const payload = await postAdminResponse<{ health_status?: string; health_message?: string }>(
        `/api/admin/streams/${row.id}/actions`,
        { action },
      );
      setNotice(
        action === "health_check"
          ? `${row.name}: ${streamHealthLabel(payload.health_status)}${
              payload.health_message ? ` - ${payload.health_message}` : ""
            }`
          : `${row.name}: ${doneLabel}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const removeRow = async (row: RadioListRow) => {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      await deleteAdmin(`/api/admin/streams/${row.id}`);
      setNotice(`${row.name} deleted.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const menuItems = (row: RadioListRow): AdminRowMenuItem[] => {
    const items: AdminRowMenuItem[] = [
      { id: "open", label: "Open", href: row.href ?? `/admin/streams/${row.id}` },
      {
        id: "chat",
        label: "Live chat",
        href: row.chat_href ?? `/admin/radio-chat?stream=${row.id}`,
      },
    ];
    if (canWrite) {
      const enabled = row.publication?.enabled ?? row.status === "active";
      items.push(
        {
          id: "health",
          label: "Check health",
          separatorBefore: true,
          onClick: () => void runRowAction(row, "health_check", "Health checked"),
        },
        {
          id: "toggle",
          label: enabled ? "Take off air" : "Put on air",
          tone: enabled ? "default" : "success",
          onClick: () =>
            void runRowAction(
              row,
              enabled ? "disable" : "enable",
              enabled ? "Taken off air" : "Put on air",
            ),
        },
        {
          id: "feature",
          label: row.is_featured ? "Unfeature" : "Feature",
          onClick: () =>
            void runRowAction(
              row,
              row.is_featured ? "unfeature" : "feature",
              row.is_featured ? "Unfeatured" : "Featured",
            ),
        },
        {
          id: "delete",
          label: "Delete",
          tone: "danger",
          separatorBefore: true,
          onClick: () => void removeRow(row),
        },
      );
    }
    return items;
  };

  const openCreate = () => {
    setCreateForm({ ...emptyCreate, host_org_id: platformOrg?.id ?? "" });
    setCreateTouched(false);
    setCreateError(null);
    setCreateOpen(true);
  };

  const createErrors = {
    name: createForm.name.trim() ? null : "Station name is required.",
    stream_url: !createForm.stream_url.trim()
      ? "Stream URL is required."
      : looksLikeStreamUrl(createForm.stream_url)
        ? null
        : "Enter a full http:// or https:// stream URL.",
    genre: createForm.genre.trim() ? null : "Pick a genre.",
    city: createForm.city.trim() ? null : "City is required.",
    host_org_id: createForm.host_org_id ? null : "Choose the managing organization.",
  };
  const createValid = Object.values(createErrors).every((value) => !value);

  const submitCreate = async () => {
    setCreateTouched(true);
    if (!createValid || !canWrite) return;
    setCreating(true);
    setCreateError(null);
    try {
      await postAdminResponse("/api/admin/streams", {
        name: createForm.name.trim(),
        slug: slugifyStream(createForm.name),
        stream_url: createForm.stream_url.trim(),
        genre: createForm.genre,
        city: createForm.city.trim(),
        tagline: createForm.tagline.trim(),
        host_org_id: createForm.host_org_id,
        website_url: "",
        status: createForm.status,
      });
      setCreateOpen(false);
      setNotice(`${createForm.name.trim()} created as ${streamStatusLabel(createForm.status).toLowerCase()}.`);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const openImport = async () => {
    setImportOpen(true);
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
    setImportLoading(true);
    try {
      const response = await adminFetch("/api/admin/streams/import-ethiopian");
      const payload = (await response.json().catch(() => ({}))) as ImportPayload;
      if (!response.ok) throw new Error(payload.error || payload.message || "Preview failed");
      setImportPreview(payload.preview ?? payload);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setImportLoading(false);
    }
  };

  const confirmImport = async () => {
    setImportApplying(true);
    setImportError(null);
    try {
      const result = await postAdminResponse<ImportPayload>(
        "/api/admin/streams/import-ethiopian",
        { confirm: true },
      );
      setImportResult(result);
      setImportPreview(null);
      await load();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportApplying(false);
    }
  };

  const hasFilters =
    Boolean(debouncedQuery) ||
    status !== "all" ||
    genre !== "all" ||
    Boolean(organization) ||
    health !== "all" ||
    featured !== "all";

  const resetFilters = () => {
    setQuery("");
    setStatus("all");
    setGenre("all");
    setOrganization("");
    setHealth("all");
    setFeatured("all");
  };

  const previewCounts = importPreview
    ? {
        create: importPreview.create?.length ?? 0,
        update: importPreview.update?.length ?? 0,
        duplicates: importPreview.duplicates?.length ?? 0,
        missing: importPreview.missing_playback?.length ?? 0,
      }
    : null;

  return (
    <>
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <AdminReloadButton
          loading={loading}
          onClick={() => setReloadKey((key) => key + 1)}
        />
        {canWrite ? (
          <>
            <button
              type="button"
              onClick={() => void openImport()}
              className="h-10 rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
            >
              Import Ethiopian stations
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              New station
            </button>
          </>
        ) : null}
      </div>

      <AdminFilterPanel>
        <AdminSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search name, tagline, genre, city"
        />
        <div className="flex flex-wrap gap-2">
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All publication statuses</option>
            {streamStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={health} onChange={setHealth}>
            <option value="all">Any playback health</option>
            {streamHealthStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={genre} onChange={setGenre}>
            <option value="all">All genres</option>
            {streamGenres.map((item) => (
              <option key={item} value={item.toLowerCase()}>
                {item}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={organization} onChange={setOrganization}>
            <option value="">All organizations</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={featured} onChange={setFeatured}>
            <option value="all">Featured: any</option>
            <option value="yes">Featured only</option>
            <option value="no">Not featured</option>
          </AdminSelect>
          <AdminSelect value={sort} onChange={setSort}>
            {sortOptions.map((item) => (
              <option key={item.id} value={item.id}>
                Sort: {item.label}
              </option>
            ))}
          </AdminSelect>
          <button
            type="button"
            onClick={() => setOrder((current) => (current === "asc" ? "desc" : "asc"))}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm hover:bg-muted"
            aria-label={`Sort order ${order === "asc" ? "ascending" : "descending"}`}
          >
            {order === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
          {hasFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="h-10 rounded-lg px-3 text-sm text-primary hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </AdminFilterPanel>

      <AdminTableShell>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-semibold">Station</th>
                <th className="px-4 py-3 font-semibold">Organization</th>
                <th className="px-4 py-3 font-semibold">Genre · City</th>
                <th className="px-4 py-3 font-semibold">Publication</th>
                <th className="px-4 py-3 font-semibold">Playback health</th>
                <th className="px-4 py-3 font-semibold">Featured</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <AdminTableLoading colSpan={7} label="Loading stations…" />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <AdminEmpty
                      title={hasFilters ? "No stations match these filters" : "No stations yet"}
                      description={
                        hasFilters
                          ? "Try clearing a filter."
                          : "Create a station with a stream URL, or import the Ethiopian catalog."
                      }
                    />
                  </td>
                </tr>
              ) : (
              rows.map((row) => {
                const healthStatus = row.playback_health?.status || "unknown";
                const enabled = row.publication?.enabled ?? row.status === "active";
                const name = orgName(row);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {row.image_url?.trim() ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.image_url}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted text-[10px] text-text-secondary">
                            Logo
                          </div>
                        )}
                        <div className="min-w-0">
                          <Link
                            href={row.href ?? `/admin/streams/${row.id}`}
                            className="font-medium text-text-primary hover:text-primary"
                          >
                            {row.name}
                          </Link>
                          {row.tagline ? (
                            <p className="max-w-xs truncate text-xs text-text-secondary">
                              {row.tagline}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {name ? (
                        <span>{name}</span>
                      ) : (
                        <span className="text-amber-700" title="Gifts need a managing organization">
                          No org
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.genre || "-"}
                      {row.city ? ` · ${row.city}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone(row.status)}>
                        {streamStatusLabel(row.status)}
                      </StatusBadge>
                      {enabled ? (
                        <p className="mt-0.5 text-[11px] text-text-secondary">Listed, not verified</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span title={row.playback_health?.message || undefined}>
                        <StatusBadge tone={streamHealthTone(healthStatus)}>
                          {streamHealthLabel(healthStatus)}
                        </StatusBadge>
                      </span>
                      <p className="mt-0.5 text-[11px] text-text-secondary">
                        {formatChecked(row.playback_health?.checked_at)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {row.is_featured ? (
                        <StatusBadge tone="success">Featured</StatusBadge>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AdminRowMenu
                        items={menuItems(row)}
                        disabled={busyId === row.id}
                        aria-label={`Actions for ${row.name}`}
                      />
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      </AdminTableShell>

      {total > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-text-secondary">
          <span>
            {total.toLocaleString()} station{total === 1 ? "" : "s"} · page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-md border border-border bg-card px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              className="rounded-md border border-border bg-card px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <AdminModal
        open={createOpen}
        title="New radio station"
        onClose={() => setCreateOpen(false)}
        footer={
          <AdminModalFooter
            onCancel={() => setCreateOpen(false)}
            onSave={() => void submitCreate()}
            saving={creating}
            saveLabel="Create station"
          />
        }
      >
        <div className="grid gap-4">
          {createError ? <AdminErrorAlert message={createError} /> : null}
          <p className="text-xs text-text-secondary">
            Fields marked <span className="text-red-600">*</span> are required. New stations start{" "}
            <strong>Off air</strong>; run a health check before putting one on air.
          </p>
          <RequiredLabel
            label="Station name"
            error={createTouched ? createErrors.name : null}
          >
            <input
              className={fieldClass}
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g. Sheger FM 102.1"
            />
          </RequiredLabel>
          <RequiredLabel
            label="Stream URL"
            hint="Direct audio link (MP3, AAC, Icecast, or HLS). Must be http(s)."
            error={createTouched ? createErrors.stream_url : null}
          >
            <input
              className={fieldClass}
              value={createForm.stream_url}
              onChange={(e) => setCreateForm({ ...createForm, stream_url: e.target.value })}
              placeholder="https://example.com/live.mp3"
              inputMode="url"
            />
          </RequiredLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <RequiredLabel label="Genre" error={createTouched ? createErrors.genre : null}>
              <select
                className={fieldClass}
                value={createForm.genre}
                onChange={(e) => setCreateForm({ ...createForm, genre: e.target.value })}
              >
                {streamGenres.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </RequiredLabel>
            <RequiredLabel label="City" error={createTouched ? createErrors.city : null}>
              <input
                className={fieldClass}
                value={createForm.city}
                onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
              />
            </RequiredLabel>
          </div>
          <RequiredLabel
            label="Managing organization"
            hint="The org owner receives coin gifts sent to this station."
            error={createTouched ? createErrors.host_org_id : null}
          >
            <select
              className={fieldClass}
              value={createForm.host_org_id}
              onChange={(e) => setCreateForm({ ...createForm, host_org_id: e.target.value })}
            >
              <option value="">Select an organization…</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.is_platform ? "★ " : ""}
                  {org.name} ({org.public_id})
                </option>
              ))}
            </select>
          </RequiredLabel>
          <RequiredLabel
            label="Publication status"
            hint="Defaults to Off air. Going on air does not prove the stream plays."
          >
            <select
              className={fieldClass}
              value={createForm.status}
              onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
            >
              {[...streamStatuses].reverse().map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </RequiredLabel>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-text-primary">Tagline (optional)</span>
            <input
              className={fieldClass}
              value={createForm.tagline}
              onChange={(e) => setCreateForm({ ...createForm, tagline: e.target.value })}
            />
          </label>
        </div>
      </AdminModal>

      <AdminModal
        open={importOpen}
        title="Import Ethiopian stations"
        onClose={() => setImportOpen(false)}
        className="max-w-2xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
            >
              {importResult ? "Close" : "Cancel"}
            </button>
            {importPreview && !importResult ? (
              <button
                type="button"
                disabled={
                  importApplying ||
                  !previewCounts ||
                  previewCounts.create + previewCounts.update === 0
                }
                onClick={() => void confirmImport()}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {importApplying
                  ? "Importing…"
                  : `Confirm import (${(previewCounts?.create ?? 0) + (previewCounts?.update ?? 0)})`}
              </button>
            ) : null}
          </div>
        }
      >
        <div className="grid gap-4">
          {importError ? <AdminErrorAlert message={importError} /> : null}
          {importLoading ? <AdminLoadingRow label="Building import preview…" /> : null}

          {importResult ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-medium">Import applied.</p>
              <p className="mt-1">
                Created {importResult.created ?? 0} · Updated {importResult.updated ?? 0}
              </p>
              <p className="mt-1 text-xs">
                Imported stations stay off air until you run a health check and enable them.
              </p>
            </div>
          ) : null}

          {importPreview && previewCounts ? (
            <>
              <p className="text-sm text-text-secondary">
                This is a preview only - nothing has changed yet.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ImportCount label="Will create" count={previewCounts.create} tone="text-emerald-700" />
                <ImportCount label="Will update" count={previewCounts.update} tone="text-sky-700" />
                <ImportCount label="Duplicates skipped" count={previewCounts.duplicates} />
                <ImportCount label="Missing playback URL" count={previewCounts.missing} tone="text-amber-700" />
              </div>
              <div className="space-y-2">
                <ImportList title="Will create" items={importPreview.create} />
                <ImportList title="Will update" items={importPreview.update} />
                <ImportList title="Duplicates" items={importPreview.duplicates} />
                <ImportList title="Missing playback URL" items={importPreview.missing_playback} />
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-text-secondary">
                <p>
                  Matching: {importPreview.policy?.match ?? "source_id or slug - never name alone"}.
                </p>
                <p className="mt-1">
                  Preserved on update:{" "}
                  {(importPreview.policy?.preserve_local ?? [
                    "host_org_id",
                    "is_featured",
                    "status",
                    "sort_order",
                  ]).join(", ")}
                  . New stations start {importPreview.policy?.new_default_status ?? "inactive"}.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </AdminModal>
    </>
  );
}
