"use client";

import { useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminReloadButton,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { adminFetch, deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";

type PlanRow = {
  id: string;
  slug: string;
  name: string;
  badge: string;
  price_amount: number;
  currency: string;
  billing_period: string;
  member_limit: number | null;
  features: string[];
  sort_order: number;
  is_active: boolean;
};

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

export default function AppMembershipsPage() {
  const [actionError, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [badge, setBadge] = useState("");
  const [price, setPrice] = useState("");
  const [memberLimit, setMemberLimit] = useState("");
  const [featuresText, setFeaturesText] = useState("");
  const [sortOrder, setSortOrder] = useState("10");
  const [isActive, setIsActive] = useState(true);

  const {
    data,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<{ data?: PlanRow[]; error?: string }>({
    key: adminCacheKey(["app-membership-plans"]),
    fetcher: async () => {
      const res = await adminFetch("/api/admin/app-membership-plans");
      const payload = (await res.json()) as { data?: PlanRow[]; error?: string };
      if (!res.ok) throw new Error(payload.error || "Failed to load plans");
      return payload;
    },
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const error = actionError ?? loadError;

  const openCreate = () => {
    setEditing(null);
    setSlug("");
    setName("");
    setBadge("");
    setPrice("");
    setMemberLimit("");
    setFeaturesText("");
    setSortOrder(String((rows.at(-1)?.sort_order ?? 0) + 10));
    setIsActive(true);
    setError(null);
    setOpen(true);
  };

  const openEdit = (row: PlanRow) => {
    setEditing(row);
    setSlug(row.slug);
    setName(row.name);
    setBadge(row.badge || "");
    setPrice(String(row.price_amount));
    setMemberLimit(row.member_limit != null ? String(row.member_limit) : "");
    setFeaturesText((row.features || []).join("\n"));
    setSortOrder(String(row.sort_order ?? 0));
    setIsActive(row.is_active !== false);
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    const priceNum = Number(price);
    if (!slug.trim() || !name.trim()) {
      setError("Slug and name are required");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError("Price must be a non-negative number");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        slug: slug.trim().toLowerCase(),
        name: name.trim(),
        badge: badge.trim(),
        price_amount: priceNum,
        currency: "ETB",
        billing_period: "month",
        member_limit: memberLimit.trim() === "" ? null : Number(memberLimit),
        features: featuresText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
      };
      if (editing) await patchAdmin(`/api/admin/app-membership-plans/${editing.id}`, body);
      else await postAdmin("/api/admin/app-membership-plans", body);
      setOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: PlanRow) => {
    if (!window.confirm(`Delete plan “${row.name}”?`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/app-membership-plans/${row.id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="App memberships"
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => void refresh()}
            />
            <button
              type="button"
              onClick={openCreate}
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Add plan
            </button>
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading && !data ? <AdminLoadingRow label="Loading plans…" /> : null}
        {!loading && rows.length === 0 ? (
          <AdminEmpty title="No plans" description="Seeded plans appear after migration, or add one." />
        ) : null}
        {rows.map((row) => (
          <article
            key={row.id}
            className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-text-secondary">{row.name}</p>
                {row.badge ? (
                  <span className="mt-1 inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    {row.badge}
                  </span>
                ) : null}
              </div>
              <StatusBadge tone={row.is_active ? "success" : "neutral"}>
                {row.is_active ? "Active" : "Hidden"}
              </StatusBadge>
            </div>
            <p className="font-heading text-2xl font-semibold text-emerald-600">
              {Number(row.price_amount).toLocaleString()} {row.currency}/{row.billing_period}
            </p>
            {row.member_limit != null ? (
              <p className="mt-1 text-xs text-text-hint">Up to {row.member_limit} members</p>
            ) : null}
            <ul className="mt-4 flex-1 space-y-1.5 text-sm text-text-secondary">
              {(row.features || []).map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-emerald-600">•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => openEdit(row)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void remove(row)}
                className="text-xs font-medium text-red-700 hover:underline"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      <AdminModal
        open={open}
        title={editing ? `Edit “${editing.name}”` : "Add plan"}
        onClose={() => setOpen(false)}
        className="max-w-lg"
        footer={
          <AdminModalFooter
            onCancel={() => setOpen(false)}
            onSave={() => void save()}
            saving={saving}
            saveLabel="Save"
          />
        }
      >
        <div className="grid gap-3">
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
          />
          <input
            className={fieldClass}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Slug (starter)"
            disabled={Boolean(editing)}
          />
          <input
            className={fieldClass}
            value={badge}
            onChange={(e) => setBadge(e.target.value)}
            placeholder="Badge (optional)"
          />
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price (ETB / month)"
          />
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={memberLimit}
            onChange={(e) => setMemberLimit(e.target.value)}
            placeholder="Member limit"
          />
          <textarea
            className="min-h-32 w-full rounded-lg border border-border px-3 py-2 text-sm"
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
            placeholder={"One feature per line"}
          />
          <input
            type="number"
            className={fieldClass}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            placeholder="Sort order"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active in app
          </label>
        </div>
      </AdminModal>
    </div>
  );
}
