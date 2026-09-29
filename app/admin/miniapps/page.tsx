"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminSearchInput,
  AdminSelect,
  AdminTableActions,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { adminFetch, deleteAdmin, patchAdmin, postAdmin, uploadAdmin } from "@/lib/hooks";
import { miniAppCategories, slugifyMiniApp } from "@/lib/miniapps";
import { getSupabase } from "@/lib/supabase/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { MiniAppRow } from "@/lib/types";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

type MiniAppDraft = {
  name: string;
  partner: string;
  summary: string;
  category: string;
  url: string;
  published: boolean;
  sort_order: number;
};

function miniAppLogoUrl(row: Pick<MiniAppRow, "logo_url"> & { icon_url?: string | null }) {
  const logo = (row.logo_url ?? "").trim();
  if (logo) return logo;
  return (row.icon_url ?? "").trim();
}

function draftFromRow(row: MiniAppRow): MiniAppDraft {
  return {
    name: row.name,
    partner: row.partner,
    summary: row.summary,
    category: row.category,
    url: row.url,
    published: row.published,
    sort_order: row.sort_order,
  };
}

export default function MiniAppsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("miniapps:write");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<MiniAppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("https://www.zemenservice.com/");
  const [creating, setCreating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLogo, setEditingLogo] = useState("");
  const [draft, setDraft] = useState<MiniAppDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const load = async () => {
    const { data, error: loadError } = await getSupabase()
      .from("mini_apps")
      .select("*")
      .order("sort_order")
      .order("name")
      .limit(500);
    if (loadError) throw loadError;
    setRows((data ?? []) as MiniAppRow[]);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status === "published" && !row.published) return false;
      if (status === "hidden" && row.published) return false;
      if (!q) return true;
      return [row.name, row.slug, row.partner, row.summary, row.category, row.url]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [query, rows, status]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setCreating(true);
    setError(null);
    try {
      await postAdmin("/api/admin/miniapps", {
        name: name.trim(),
        slug: slugifyMiniApp(name),
        url: url.trim(),
        partner: name.trim(),
        category: "Services",
        published: true,
      });
      setName("");
      setUrl("https://");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (row: MiniAppRow) => {
    setEditingId(row.id);
    setEditingLogo(miniAppLogoUrl(row));
    setDraft(draftFromRow(row));
    setEditOpen(true);
    setError(null);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingId(null);
    setEditingLogo("");
    setDraft(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const uploadLogo = async (file: File) => {
    if (!editingId || !canWrite) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const payload = await uploadAdmin(`/api/admin/miniapps/${editingId}/image`, file);
      const next = (payload.logo_url ?? "").trim();
      setEditingLogo(next);
      setRows((prev) =>
        prev.map((row) => (row.id === editingId ? { ...row, logo_url: next } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    if (!editingId || !canWrite) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/miniapps/${editingId}/image`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Remove failed");
      setEditingLogo("");
      setRows((prev) =>
        prev.map((row) => (row.id === editingId ? { ...row, logo_url: "" } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploadingLogo(false);
    }
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    setSaving(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/miniapps/${editingId}`, {
        name: draft.name.trim(),
        partner: draft.partner.trim(),
        summary: draft.summary.trim(),
        category: draft.category,
        url: draft.url.trim(),
        published: draft.published,
        sort_order: draft.sort_order,
      });
      closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: MiniAppRow) => {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/miniapps/${row.id}`);
      if (editingId === row.id) closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Mini apps"
        description="HTTPS partner sites that open inside the SpoJex WebView. Zemen Service is seeded and ready to publish."
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {canWrite ? (
        <form
          onSubmit={create}
          className="mb-6 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="App name"
              required
              className={fieldClass}
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.zemenservice.com/"
              required
              className={fieldClass}
            />
            <button
              type="submit"
              disabled={creating || !name.trim() || !url.trim()}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Add mini app
            </button>
          </div>
        </form>
      ) : null}
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name, partner, URL" />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading mini apps…" /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty title="No mini apps" description="Add an HTTPS URL to show it in the host Apps tab." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">App</th>
                  <th className="px-4 py-3 font-semibold">URL</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const logo = miniAppLogoUrl(row);
                  return (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                          {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-text-secondary">
                              {(row.name || "A").slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-text-primary">{row.name}</p>
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {row.partner || row.slug}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-primary hover:underline"
                      >
                        {row.url}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{row.category}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={row.published ? "success" : "neutral"}>
                        {row.published ? "Published" : "Hidden"}
                      </StatusBadge>
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <AdminTableActions
                          canWrite
                          onEdit={() => openEdit(row)}
                          onDelete={() => remove(row)}
                        />
                      </td>
                    ) : null}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>

      <AdminModal
        open={editOpen && Boolean(draft)}
        title="Edit mini app"
        onClose={closeEdit}
        footer={<AdminModalFooter onCancel={closeEdit} onSave={saveEdit} saving={saving} />}
      >
        {draft ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                {editingLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editingLogo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-text-secondary">
                    {(draft.name || "A").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium text-text-primary">Logo</p>
                <p className="text-xs text-text-secondary">JPG, PNG, WebP, or GIF · up to 5 MB</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadLogo(file);
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploadingLogo || !canWrite}
                    onClick={() => logoInputRef.current?.click()}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {uploadingLogo ? "Uploading…" : editingLogo ? "Replace logo" : "Upload logo"}
                  </button>
                  {editingLogo ? (
                    <button
                      type="button"
                      disabled={uploadingLogo || !canWrite}
                      onClick={() => void removeLogo()}
                      className="text-xs text-text-secondary underline disabled:opacity-60"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Partner</span>
              <input
                value={draft.partner}
                onChange={(e) => setDraft({ ...draft, partner: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Summary</span>
              <textarea
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                rows={2}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">URL</span>
              <input
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="https://www.zemenservice.com/"
                className={fieldClass}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Category</span>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  className={fieldClass}
                >
                  {miniAppCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Sort order</span>
                <input
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) =>
                    setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
                  }
                  className={fieldClass}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
              />
              <span>Published in the host Apps tab</span>
            </label>
          </div>
        ) : null}
      </AdminModal>
    </>
  );
}
