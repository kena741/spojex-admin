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
import { useAdminPermissions } from "@/lib/use-admin-permissions";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

type BannerRow = {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
};

type BannerDraft = {
  title: string;
  link_url: string;
  is_active: boolean;
  sort_order: number;
};

export default function BannersPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("banners:write") || can("services:write");
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState("");
  const [draft, setDraft] = useState<BannerDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const response = await fetch("/api/admin/banners", { credentials: "same-origin" });
    const payload = (await response.json()) as { data?: BannerRow[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Failed to load banners");
    setRows(payload.data ?? []);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status === "active" && !row.is_active) return false;
      if (status === "hidden" && row.is_active) return false;
      if (!q) return true;
      return [row.title, row.link_url, row.image_url]
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
      await postAdmin("/api/admin/banners", {
        title: title.trim(),
        link_url: linkUrl.trim(),
        is_active: true,
        sort_order: rows.length,
      });
      setTitle("");
      setLinkUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (row: BannerRow) => {
    setEditingId(row.id);
    setEditingImage((row.image_url ?? "").trim());
    setDraft({
      title: row.title ?? "",
      link_url: row.link_url ?? "",
      is_active: row.is_active,
      sort_order: row.sort_order ?? 0,
    });
    setEditOpen(true);
    setError(null);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingId(null);
    setEditingImage("");
    setDraft(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const uploadImage = async (file: File) => {
    if (!editingId || !canWrite) return;
    setUploading(true);
    setError(null);
    try {
      const payload = await uploadAdmin(`/api/admin/banners/${editingId}/image`, file);
      const next = (payload.image_url ?? "").trim();
      setEditingImage(next);
      setRows((prev) =>
        prev.map((row) => (row.id === editingId ? { ...row, image_url: next } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const removeImage = async () => {
    if (!editingId || !canWrite) return;
    setUploading(true);
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/banners/${editingId}/image`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Remove failed");
      setEditingImage("");
      setRows((prev) =>
        prev.map((row) => (row.id === editingId ? { ...row, image_url: "" } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploading(false);
    }
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    setSaving(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/banners/${editingId}`, {
        title: draft.title.trim(),
        link_url: draft.link_url.trim(),
        is_active: draft.is_active,
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

  const remove = async (row: BannerRow) => {
    if (!window.confirm(`Delete banner “${row.title || "Untitled"}”?`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/banners/${row.id}`);
      if (editingId === row.id) closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const toggleActive = async (row: BannerRow) => {
    if (!canWrite) return;
    setError(null);
    try {
      await patchAdmin(`/api/admin/banners/${row.id}`, { is_active: !row.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Banners"
        description="Ad / promo slides for Home, Services, and Gym. Upload an image and optional tap link."
      />
      {error ? <AdminErrorAlert message={error} /> : null}

      {canWrite ? (
        <form
          onSubmit={create}
          className="mb-6 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              className={fieldClass}
            />
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Link URL or /route (optional)"
              className={fieldClass}
            />
            <button
              type="submit"
              disabled={creating}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Add banner
            </button>
          </div>
          <p className="text-xs text-text-secondary">
            After creating, open Edit to upload the banner image.
          </p>
        </form>
      ) : null}

      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search title or link" />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>

      {loading ? <AdminLoadingRow label="Loading banners…" /> : null}

      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title="No banners"
            description="Add a banner, then upload an image to show it in the app."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Banner</th>
                  <th className="px-4 py-3 font-semibold">Link</th>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const image = (row.image_url ?? "").trim();
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                            {image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={image} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-text-secondary">
                                No image
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-text-primary">
                              {row.title?.trim() || "Untitled"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.link_url?.trim() ? (
                          <span className="break-all">{row.link_url}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.sort_order}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void toggleActive(row)}
                          disabled={!canWrite}
                          className="disabled:cursor-default"
                        >
                          <StatusBadge tone={row.is_active ? "success" : "neutral"}>
                            {row.is_active ? "Active" : "Hidden"}
                          </StatusBadge>
                        </button>
                      </td>
                      {canWrite ? (
                        <td className="px-4 py-3">
                          <AdminTableActions
                            canWrite
                            onEdit={() => openEdit(row)}
                            onDelete={() => void remove(row)}
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
        title="Edit banner"
        onClose={closeEdit}
        footer={
          <AdminModalFooter
            onCancel={closeEdit}
            onSave={() => void saveEdit()}
            saving={saving || uploading}
          />
        }
      >
        {draft ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-border bg-muted">
              <div className="aspect-[3.8/1] w-full">
                {editingImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editingImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-text-secondary">
                    No image yet
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadImage(file);
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => imageInputRef.current?.click()}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload image"}
              </button>
              {editingImage ? (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => void removeImage()}
                  className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  Remove image
                </button>
              ) : null}
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-text-secondary">Title</span>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-text-secondary">Link URL</span>
              <input
                value={draft.link_url}
                onChange={(e) => setDraft({ ...draft, link_url: e.target.value })}
                placeholder="https://… or /services"
                className={fieldClass}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-text-secondary">Sort order</span>
                <input
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) =>
                    setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
                  }
                  className={fieldClass}
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                />
                Active on app
              </label>
            </div>
          </div>
        ) : null}
      </AdminModal>
    </>
  );
}
