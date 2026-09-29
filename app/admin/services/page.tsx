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
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import type { ServiceCategory, ServiceRow, ServiceSubcategory } from "@/lib/types";
import { formatDate, formatStatusLabel } from "@/lib/utils";

function coverOf(row: ServiceRow) {
  const images = Array.isArray(row.images) ? row.images.filter((item) => typeof item === "string") : [];
  return (typeof images[0] === "string" && images[0]) || row.cover_url || "";
}

function money(row: ServiceRow) {
  if (row.price_amount == null) return formatStatusLabel(row.pricing_type);
  return `${row.currency} ${Number(row.price_amount).toLocaleString("en-ET", { maximumFractionDigits: 0 })}`;
}

function catalogLabel(
  id: string | null | undefined,
  rows: { id: string; label: string; emoji?: string }[],
  embedded?: { label: string; emoji?: string } | null,
) {
  if (embedded?.label) return `${embedded.emoji ?? ""} ${embedded.label}`.trim();
  const match = rows.find((item) => item.id === id);
  return match ? `${match.emoji ?? ""} ${match.label}`.trim() : "—";
}

export default function ServicesPage() {
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ServiceSubcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [published, setPublished] = useState("pending");

  const load = async () => {
    const response = await fetch("/api/admin/services", { credentials: "same-origin" });
    const payload = (await response.json()) as {
      data?: ServiceRow[];
      categories?: ServiceCategory[];
      subcategories?: ServiceSubcategory[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load services");
    setRows(payload.data ?? []);
    setCategories(payload.categories ?? []);
    setSubcategories(payload.subcategories ?? []);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (category !== "all" && row.category_id !== category) return false;
      if (published === "yes" && !row.published) return false;
      if (published === "pending" && row.published) return false;
      if (!q) return true;
      return [
        row.title,
        row.description,
        row.city,
        row.users?.display_name,
        row.category?.label,
        row.subcategory?.label,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [category, published, query, rows]);

  const pendingCount = rows.filter((row) => !row.published).length;

  const approve = async (id: string, next: boolean) => {
    setBusy(id);
    try {
      await patchAdmin(`/api/admin/services/${id}`, { published: next });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: ServiceRow) => {
    if (!window.confirm(`Delete “${row.title}”? This cannot be undone.`)) return;
    setBusy(row.id);
    try {
      await deleteAdmin(`/api/admin/services/${row.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const approveAll = async () => {
    if (!pendingCount) return;
    if (!window.confirm(`Approve all ${pendingCount} pending listings?`)) return;
    setBusy("all");
    try {
      await postAdmin("/api/admin/services", { action: "approve_all" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve all failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Services"
        description={`${filtered.length} of ${rows.length} · ${pendingCount} pending approval`}
        actions={
          pendingCount > 0 ? (
            <button
              type="button"
              disabled={busy === "all"}
              onClick={approveAll}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy === "all" ? "Approving…" : "Approve all pending"}
            </button>
          ) : null
        }
      />
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_160px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search title, city, provider" />
          <AdminSelect value={category} onChange={setCategory}>
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.emoji} {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={published} onChange={setPublished}>
            <option value="pending">Pending approval</option>
            <option value="yes">Approved</option>
            <option value="all">All listings</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading services…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title={published === "pending" ? "No pending listings" : "No services"}
            description={
              published === "pending"
                ? "New listings wait here until an admin approves them."
                : "Listings from the superapp marketplace appear here."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Provider</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Rating</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const cover = coverOf(row);
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt="" className="h-12 w-16 rounded-md object-cover" />
                          ) : (
                            <div className="grid h-12 w-16 place-items-center rounded-md bg-muted text-[10px] text-text-hint">
                              No photo
                            </div>
                          )}
                          <div>
                            <Link href={`/admin/services/${row.id}`} className="font-medium text-text-primary">
                              {row.title}
                            </Link>
                            <p className="text-xs text-text-secondary">
                              {[row.city || row.country, row.duration_minutes ? `${row.duration_minutes} min` : ""]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.users ? (
                          <>
                            <Link href={`/admin/users/${row.users.id}`} className="text-primary">
                              {row.users.display_name}
                            </Link>
                            {row.users.role ? (
                              <p className="text-xs capitalize text-text-secondary">{row.users.role}</p>
                            ) : null}
                          </>
                        ) : (
                          row.provider_id.slice(0, 8)
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        <p>{catalogLabel(row.category_id, categories, row.category)}</p>
                        <p className="text-xs">
                          {catalogLabel(row.subcategory_id, subcategories, row.subcategory)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{money(row)}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.review_count > 0 ? `${row.rating_avg.toFixed(1)} (${row.review_count})` : "Not rated"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={requestTone(row.published ? "approved" : "pending")}>
                          {row.published ? "Approved" : "Pending approval"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {row.published ? (
                            <button
                              type="button"
                              disabled={busy === row.id}
                              className="text-sm font-medium text-text-secondary disabled:opacity-50"
                              onClick={() => approve(row.id, false)}
                            >
                              Unpublish
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy === row.id}
                              className="text-sm font-medium text-primary disabled:opacity-50"
                              onClick={() => approve(row.id, true)}
                            >
                              Approve
                            </button>
                          )}
                          <Link href={`/admin/services/${row.id}`} className="text-sm font-medium text-primary">
                            View
                          </Link>
                          <button
                            type="button"
                            disabled={busy === row.id}
                            className="text-sm font-medium text-red-600 disabled:opacity-50"
                            onClick={() => remove(row)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
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
