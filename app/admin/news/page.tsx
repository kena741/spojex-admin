"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminSearchInput,
  AdminSelect,
  AdminTableActions,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { newsCategories, newsStatusLabel, newsStatuses, slugifyNews } from "@/lib/news";
import { deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { SportNewsRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type NewsDraft = {
  title: string;
  category: string;
  status: string;
};

export default function NewsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("news:write");
  const [rows, setRows] = useState<SportNewsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewsDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error: loadError } = await getSupabase()
      .from("sport_news")
      .select("*")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("sort_order")
      .limit(500);
    if (loadError) throw loadError;
    setRows((data ?? []) as SportNewsRow[]);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return [row.title, row.slug, row.summary, row.category, row.source]
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
      await postAdmin("/api/admin/news", {
        title: title.trim(),
        slug: slugifyNews(title),
        category,
        status: "draft",
      });
      setTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (row: SportNewsRow) => {
    setEditingId(row.id);
    setDraft({ title: row.title, category: row.category, status: row.status });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    setSaving(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/news/${editingId}`, {
        title: draft.title.trim(),
        category: draft.category,
        status: draft.status,
      });
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: SportNewsRow) => {
    if (!window.confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/news/${row.id}`);
      if (editingId === row.id) cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader title="Sport news" description="Articles for the home feed" />
      {error ? <AdminErrorAlert message={error} /> : null}
      {canWrite ? (
        <form
          onSubmit={create}
          className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:grid-cols-[1fr_160px_auto]"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Headline"
            required
            className="h-10 rounded-lg border border-border px-3 text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 rounded-lg border border-border px-3 text-sm"
          >
            {newsCategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            New article
          </button>
        </form>
      ) : null}
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search headline, category, source" />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            {newsStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading articles…" /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty title="No articles" description="Create sport news to show on the home feed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Article</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Featured</th>
                  <th className="px-4 py-3 font-semibold">Published</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isEditing = editingId === row.id && draft;
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            value={draft.title}
                            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                            className="h-9 w-full min-w-[180px] rounded-lg border border-border px-2 text-sm"
                          />
                        ) : (
                          <>
                            <Link href={`/admin/news/${row.id}`} className="font-medium text-text-primary hover:text-primary">
                              {row.title}
                            </Link>
                            <p className="mt-0.5 text-xs text-text-secondary">
                              {row.source}
                              {row.author ? ` · ${row.author}` : ""}
                              {row.video_url?.trim()
                                ? " · Video"
                                : row.audio_url?.trim()
                                  ? " · Audio"
                                  : ""}
                            </p>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={draft.category}
                            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                            className="h-9 rounded-lg border border-border px-2 text-sm"
                          >
                            {newsCategories.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-text-secondary">{row.category}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={draft.status}
                            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                            className="h-9 rounded-lg border border-border px-2 text-sm"
                          >
                            {newsStatuses.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <StatusBadge tone={requestTone(row.status)}>{newsStatusLabel(row.status)}</StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.is_featured ? (
                          <StatusBadge tone="success">Featured</StatusBadge>
                        ) : (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.published_at ? formatDate(row.published_at) : "—"}
                      </td>
                      {canWrite ? (
                        <td className="px-4 py-3">
                          <AdminTableActions
                            canWrite
                            editing={Boolean(isEditing)}
                            saving={saving}
                            onEdit={() => startEdit(row)}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
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
    </>
  );
}
