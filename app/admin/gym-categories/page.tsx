"use client";

import { useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import { deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { slugifyCategory } from "@/lib/service-categories";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";

export type GymCategoryRow = {
  id: string;
  slug: string;
  label: string;
  emoji: string;
  sort_order: number;
};

type CategoryDraft = {
  label: string;
  emoji: string;
  sort_order: number;
};

export default function GymCategoriesPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("gyms:write");
  const [rows, setRows] = useState<GymCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [emoji, setEmoji] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CategoryDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const spojex = getSpojexClient();
    const { data, error: loadError } = await spojex
      .from("gym_categories")
      .select("*")
      .order("sort_order");
    if (loadError) throw loadError;
    setRows((data ?? []) as GymCategoryRow[]);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await postAdmin("/api/admin/gym-categories", {
        label: label.trim(),
        slug: slug.trim() || slugifyCategory(label),
        emoji: emoji.trim(),
        sort_order: rows.length + 1,
      });
      setLabel("");
      setSlug("");
      setEmoji("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const startEdit = (row: GymCategoryRow) => {
    setEditingId(row.id);
    setDraft({
      label: row.label,
      emoji: row.emoji,
      sort_order: row.sort_order,
    });
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
      await patchAdmin(`/api/admin/gym-categories/${editingId}`, {
        label: draft.label.trim(),
        emoji: draft.emoji.trim(),
        sort_order: draft.sort_order,
      });
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: GymCategoryRow) => {
    if (!window.confirm(`Delete "${row.label}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/gym-categories/${row.id}`);
      if (editingId === row.id) cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Gym categories"
        description="Venue types shown on the Gym home screen and when creating gyms."
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {canWrite ? (
        <form
          onSubmit={create}
          className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:grid-cols-[1fr_160px_80px_auto]"
        >
          <input
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              if (!slug) setSlug(slugifyCategory(event.target.value));
            }}
            placeholder="Label (Fitness center)"
            className="h-10 rounded-lg border border-border px-3 text-sm"
            required
          />
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="slug (fitness_center)"
            className="h-10 rounded-lg border border-border px-3 font-mono text-sm"
          />
          <input
            value={emoji}
            onChange={(event) => setEmoji(event.target.value)}
            placeholder="Emoji"
            className="h-10 rounded-lg border border-border px-3 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Add
          </button>
        </form>
      ) : null}
      {loading ? <AdminLoadingRow label="Loading gym categories…" /> : null}
      <AdminTableShell>
        {rows.length === 0 && !loading ? (
          <AdminEmpty
            title="No gym categories"
            description="Add categories so gym owners and members can filter venues."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Label</th>
                  <th className="px-4 py-3 font-semibold">Slug</th>
                  <th className="px-4 py-3 font-semibold">Emoji</th>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  {canWrite ? (
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isEditing = editingId === row.id && draft;
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            value={draft.label}
                            onChange={(event) =>
                              setDraft({ ...draft, label: event.target.value })
                            }
                            className="h-9 w-full rounded-md border border-border px-2 text-sm"
                          />
                        ) : (
                          <button
                            type="button"
                            className="font-medium text-left hover:underline"
                            onClick={() => startEdit(row)}
                          >
                            {row.label}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                        {row.slug}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            value={draft.emoji}
                            onChange={(event) =>
                              setDraft({ ...draft, emoji: event.target.value })
                            }
                            className="h-9 w-20 rounded-md border border-border px-2 text-sm"
                          />
                        ) : (
                          <span className="text-lg">{row.emoji || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={draft.sort_order}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                sort_order: Number(event.target.value) || 0,
                              })
                            }
                            className="h-9 w-20 rounded-md border border-border px-2 text-sm"
                          />
                        ) : (
                          row.sort_order
                        )}
                      </td>
                      {canWrite ? (
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={saveEdit}
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="rounded-md border border-border px-3 py-1.5 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="rounded-md border border-border px-3 py-1.5 text-xs"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => remove(row)}
                                className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          )}
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
