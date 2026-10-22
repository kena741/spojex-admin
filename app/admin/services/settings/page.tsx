"use client";

import { useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminReloadButton,
  AdminTableLoading,
  AdminTableShell,
} from "@/components/admin-layout";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { slugifyCategory } from "@/lib/service-categories";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import type { ServiceCategory, ServiceSubcategory } from "@/lib/types";

type CategoryDraft = {
  label: string;
  emoji: string;
  sort_order: number;
  is_sport: boolean;
};

export default function ServiceSettingsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("catalog:write") || can("services:write");
  const [actionError, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [emoji, setEmoji] = useState("");
  const [isSport, setIsSport] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CategoryDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subLabel, setSubLabel] = useState("");
  const [subEmoji, setSubEmoji] = useState("");

  const {
    data,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<{ rows: ServiceCategory[]; subs: ServiceSubcategory[] }>({
    key: adminCacheKey(["services", "settings", "categories"]),
    fetcher: async () => {
      const spojex = getSpojexClient();
      const { data: categoryRows, error: queryError } = await spojex
        .from("service_categories")
        .select("*")
        .order("sort_order");
      if (queryError) throw queryError;
      const { data: subRows, error: subError } = await spojex
        .from("service_subcategories")
        .select("*")
        .order("sort_order");
      return {
        rows: (categoryRows ?? []) as ServiceCategory[],
        subs: subError ? [] : ((subRows ?? []) as ServiceSubcategory[]),
      };
    },
  });
  const rows = data?.rows ?? [];
  const subs = data?.subs ?? [];
  const error = actionError ?? loadError;

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const selectedSubs = subs
    .filter((row) => row.category_id === selectedId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const load = async () => {
    await refresh();
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await postAdmin("/api/admin/categories", {
        label: label.trim(),
        slug: slug.trim() || slugifyCategory(label),
        emoji: emoji.trim(),
        sort_order: rows.length + 1,
        is_sport: isSport,
      });
      setLabel("");
      setSlug("");
      setEmoji("");
      setIsSport(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const startEdit = (row: ServiceCategory) => {
    setEditingId(row.id);
    setDraft({
      label: row.label,
      emoji: row.emoji,
      sort_order: row.sort_order,
      is_sport: row.is_sport !== false,
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
      await patchAdmin(`/api/admin/categories/${editingId}`, {
        label: draft.label.trim(),
        emoji: draft.emoji.trim(),
        sort_order: draft.sort_order,
        is_sport: draft.is_sport,
      });
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: ServiceCategory) => {
    if (!window.confirm(`Delete "${row.label}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/categories/${row.id}`);
      if (editingId === row.id) cancelEdit();
      if (selectedId === row.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const createSub = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setError(null);
    try {
      await postAdmin("/api/admin/subcategories", {
        category_id: selectedId,
        label: subLabel.trim(),
        emoji: subEmoji.trim(),
        sort_order: selectedSubs.length + 1,
        is_sport: selected?.is_sport !== false,
      });
      setSubLabel("");
      setSubEmoji("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add subcategory");
    }
  };

  const removeSub = async (row: ServiceSubcategory) => {
    if (!window.confirm(`Delete "${row.label}"?`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/subcategories/${row.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Service settings"
        description="Categories and subcategories used to organize marketplace service listings."
        backHref="/admin/services"
        breadcrumbs={[
          { label: "Services", href: "/admin/services" },
          { label: "Settings" },
        ]}
        actions={
          <AdminReloadButton
            loading={loading}
            refreshing={refreshing}
            onClick={() => {
              setError(null);
              void refresh();
            }}
          />
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {canWrite ? (
        <form
          onSubmit={create}
          className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:grid-cols-[1fr_160px_80px_auto_auto]"
        >
          <input
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              if (!slug) setSlug(slugifyCategory(event.target.value));
            }}
            placeholder="Label (Football Coaching)"
            className="h-10 rounded-lg border border-border px-3 text-sm"
            required
          />
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="slug (coaching)"
            className="h-10 rounded-lg border border-border px-3 font-mono text-sm"
          />
          <input
            value={emoji}
            onChange={(event) => setEmoji(event.target.value)}
            placeholder="Emoji"
            className="h-10 rounded-lg border border-border px-3 text-sm"
          />
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isSport}
              onChange={(event) => setIsSport(event.target.checked)}
            />
            Sport
          </label>
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Add
          </button>
        </form>
      ) : null}
      <AdminTableShell>
        {rows.length === 0 && !loading ? (
          <AdminEmpty
            title="No service categories"
            description="Add sport categories to organize marketplace listings."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Label</th>
                  <th className="px-4 py-3 font-semibold">Emoji</th>
                  <th className="px-4 py-3 font-semibold">Sport</th>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  <AdminTableLoading colSpan={canWrite ? 5 : 4} label="Loading service categories…" />
                ) : rows.map((row) => {
                  const isEditing = editingId === row.id && draft;
                  const sport = isEditing ? draft.is_sport : row.is_sport !== false;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-border last:border-0 ${
                        selectedId === row.id ? "bg-muted/40" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            value={draft.label}
                            onChange={(event) =>
                              setDraft({ ...draft, label: event.target.value })
                            }
                            className="h-9 w-full min-w-[160px] rounded-lg border border-border px-2 text-sm"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedId(row.id)}
                            className="font-medium text-left hover:underline"
                          >
                            {row.label}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            value={draft.emoji}
                            onChange={(event) =>
                              setDraft({ ...draft, emoji: event.target.value })
                            }
                            className="h-9 w-20 rounded-lg border border-border px-2 text-sm"
                          />
                        ) : (
                          row.emoji
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="checkbox"
                            checked={draft.is_sport}
                            onChange={(event) =>
                              setDraft({ ...draft, is_sport: event.target.checked })
                            }
                          />
                        ) : sport ? (
                          "Yes"
                        ) : (
                          "No"
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
                            className="h-9 w-20 rounded-lg border border-border px-2 text-sm"
                          />
                        ) : (
                          row.sort_order
                        )}
                      </td>
                      {canWrite ? (
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={saveEdit}
                                className="text-sm font-medium text-primary hover:underline"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="text-sm text-text-secondary hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => setSelectedId(row.id)}
                                className="text-sm text-primary hover:underline"
                              >
                                Subs
                              </button>
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="text-sm text-primary hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => remove(row)}
                                className="text-sm text-red-600 hover:underline"
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

      {selected ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">
            Subcategories · {selected.label}
          </h2>
          {canWrite ? (
            <form onSubmit={createSub} className="mb-4 grid gap-3 md:grid-cols-[1fr_80px_auto]">
              <input
                value={subLabel}
                onChange={(event) => setSubLabel(event.target.value)}
                placeholder="Subcategory (Youth coaching)"
                className="h-10 rounded-lg border border-border px-3 text-sm"
                required
              />
              <input
                value={subEmoji}
                onChange={(event) => setSubEmoji(event.target.value)}
                placeholder="Emoji"
                className="h-10 rounded-lg border border-border px-3 text-sm"
              />
              <button
                type="submit"
                className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Add subcategory
              </button>
            </form>
          ) : null}
          {selectedSubs.length === 0 ? (
            <p className="text-sm text-text-secondary">No subcategories yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {selectedSubs.map((row) => (
                <li key={row.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {row.emoji ? `${row.emoji} ` : ""}
                    {row.label}
                  </span>
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => removeSub(row)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}
