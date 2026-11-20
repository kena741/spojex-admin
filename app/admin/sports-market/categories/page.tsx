"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminReloadButton,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { SmTabs, buttonClass, fieldClass, labelClass, primaryButtonClass, smGet, smPost } from "@/components/sports-market/shared";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { patchAdmin } from "@/lib/hooks";
import { SM_API, type SmCategory } from "@/lib/sports-market";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";

export default function SportsMarketCategoriesPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("sports_market:write");
  const { data, loading, refreshing, error, refresh } = useAdminQuery<SmCategory[]>({
    key: adminCacheKey(["sports-market", "categories"]),
    fetcher: async () => (await smGet<{ categories: SmCategory[] }>("/categories")).categories,
  });
  const categories = data ?? [];
  const [editing, setEditing] = useState<SmCategory | "new" | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const toggle = async (c: SmCategory) => {
    setRowError(null);
    try {
      await patchAdmin(`${SM_API}/categories/${c.id}`, { is_active: !c.is_active });
      refresh();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Could not update the category");
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="Sports Marketplace"
        description="Product categories sellers choose from. Hidden categories stay on existing listings but can't be picked for new ones."
        actions={
          <>
            <AdminReloadButton onClick={refresh} refreshing={refreshing} />
            {canWrite ? (
              <button type="button" className={`${primaryButtonClass} h-10 px-4`} onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> Add category
              </button>
            ) : null}
          </>
        }
      />
      <SmTabs />
      {error ? <AdminErrorAlert message={error} /> : null}
      {rowError ? <AdminErrorAlert message={rowError} /> : null}
      <AdminTableShell>
        {loading && !data ? <AdminLoadingRow label="Loading categories…" /> : null}
        {!loading && categories.length === 0 && !error ? <AdminEmpty title="No categories" description="Add the first category." /> : null}
        {categories.length ? (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Order</th>
                <th className="px-4 py-3 text-right">Listings</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text-primary">{c.name}</p>
                    <p className="text-xs text-text-secondary">{c.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.sort_order}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.product_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={c.is_active ? "success" : "neutral"}>{c.is_active ? "Visible" : "Hidden"}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite ? (
                      <div className="flex justify-end gap-2">
                        <button type="button" className={buttonClass} onClick={() => setEditing(c)}>
                          Edit
                        </button>
                        <button type="button" className={buttonClass} onClick={() => toggle(c)}>
                          {c.is_active ? "Hide" : "Show"}
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </AdminTableShell>
      <CategoryModal
        category={editing}
        nextOrder={categories.reduce((m, c) => Math.max(m, c.sort_order), 0) + 10}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </div>
  );
}

function CategoryModal({
  category,
  nextOrder,
  onClose,
  onSaved,
}: {
  category: SmCategory | "new" | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [order, setOrder] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!category) return;
    setError(null);
    setName(category === "new" ? "" : category.name);
    setOrder(String(category === "new" ? nextOrder : category.sort_order));
  }, [category, nextOrder]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), sort_order: Number.parseInt(order, 10) || 0 };
      if (category === "new") await smPost("/categories", body);
      else if (category) await patchAdmin(`${SM_API}/categories/${category.id}`, body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the category");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal
      open={!!category}
      title={category === "new" ? "Add category" : "Edit category"}
      onClose={onClose}
      footer={<AdminModalFooter onCancel={onClose} onSave={save} saving={saving} disabled={name.trim().length < 2} />}
    >
      <div className="space-y-3">
        {error ? <AdminErrorAlert message={error} /> : null}
        <div>
          <label className={labelClass}>Name</label>
          <input className={fieldClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Sort order</label>
          <input className={fieldClass} type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
        </div>
      </div>
    </AdminModal>
  );
}
