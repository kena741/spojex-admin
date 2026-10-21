"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { deleteAdmin, patchAdmin } from "@/lib/hooks";
import {
  formatDelivery,
  formatDuration,
  formatRating,
  formatServicePrice,
} from "@/lib/service-pricing";
import { serviceCoverUrl } from "@/lib/services-media";
import type { ServiceCategory, ServiceRow, ServiceSubcategory } from "@/lib/types";
import { formatDate, formatStatusLabel } from "@/lib/utils";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || "all";
  const published = searchParams.get("published") || "all";

  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ServiceSubcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [listOk, setListOk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const writeParams = (patch: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const load = async () => {
    setListOk(false);
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
    setListOk(true);
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
  const selectedPending = filtered.filter((r) => selected.has(r.id) && !r.published);

  const approve = async (id: string, next: boolean) => {
    let reason: string | undefined;
    if (!next) {
      reason = window.prompt("Reason for unpublishing (required):") || undefined;
      if (!reason?.trim()) return;
    }
    setBusy(id);
    try {
      await patchAdmin(`/api/admin/services/${id}`, {
        published: next,
        moderation_reason: reason,
      });
      await load();
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  const approveSelected = async () => {
    if (!selectedPending.length) return;
    if (
      !window.confirm(
        `Approve ${selectedPending.length} selected listing(s)? Review summary:\n\n${selectedPending
          .slice(0, 8)
          .map((r) => `• ${r.title}`)
          .join("\n")}${selectedPending.length > 8 ? "\n…" : ""}`,
      )
    ) {
      return;
    }
    setBusy("selected");
    try {
      for (const row of selectedPending) {
        await patchAdmin(`/api/admin/services/${row.id}`, { published: true });
      }
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: ServiceRow) => {
    if (
      !window.confirm(
        `Archive/delete “${row.title}”? Prefer unpublish if the listing has booking history.`,
      )
    ) {
      return;
    }
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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <>
      <AdminPageHeader
        title="Services"
        description={`${filtered.length} of ${rows.length} · ${pendingCount} pending approval`}
        stackOnSmall
        actions={
          selectedPending.length > 0 ? (
            <button
              type="button"
              disabled={busy === "selected"}
              onClick={() => void approveSelected()}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy === "selected"
                ? "Approving…"
                : `Approve selected (${selectedPending.length})`}
            </button>
          ) : null
        }
      />
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_160px]">
          <AdminSearchInput
            value={query}
            onChange={(value) => writeParams({ q: value || null })}
            placeholder="Search title, city, provider"
          />
          <AdminSelect
            value={category}
            onChange={(value) => writeParams({ category: value })}
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.emoji} {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={published}
            onChange={(value) => writeParams({ published: value })}
          >
            <option value="all">All listings</option>
            <option value="pending">Pending approval</option>
            <option value="yes">Approved</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading services…" /> : null}
      {error ? (
        <div className="space-y-2">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              load()
                .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
                .finally(() => setLoading(false));
            }}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium"
          >
            Retry
          </button>
        </div>
      ) : null}
      <AdminTableShell>
        {!loading && listOk && filtered.length === 0 && !error ? (
          <AdminEmpty
            title={published === "pending" ? "No pending listings" : "No services"}
            description={
              published === "pending"
                ? "New listings wait here until an admin approves them."
                : "Listings from the superapp marketplace appear here."
            }
          />
        ) : null}
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-3 py-3 font-semibold"> </th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Service</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Provider</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Category</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Delivery</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Price</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Rating</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Status</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const cover = serviceCoverUrl(row);
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-3 py-3">
                        {!row.published ? (
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            aria-label={`Select ${row.title}`}
                          />
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover}
                              alt=""
                              className="aspect-[4/3] w-20 rounded-md object-cover bg-muted"
                            />
                          ) : (
                            <div className="grid aspect-[4/3] w-20 place-items-center rounded-md bg-muted text-[10px] text-text-hint">
                              No photo
                            </div>
                          )}
                          <div>
                            <Link
                              href={`/admin/services/${row.id}`}
                              className="font-medium text-text-primary"
                            >
                              {row.title}
                            </Link>
                            <p className="text-xs text-text-secondary">
                              {[
                                [row.city, row.country].filter(Boolean).join(", "),
                                formatDuration(row.duration_minutes),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.users ? (
                          <div className="flex items-center gap-2">
                            {row.users.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.users.avatar_url}
                                alt=""
                                className="h-7 w-7 rounded-full object-cover"
                              />
                            ) : (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-primary">
                                {(row.users.display_name || "?").slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <div>
                              <Link
                                href={`/admin/people/${row.users.id}`}
                                className="text-primary"
                              >
                                {row.users.display_name}
                              </Link>
                              {row.users.role ? (
                                <p className="text-xs capitalize text-text-secondary">
                                  {formatStatusLabel(row.users.role)}
                                  {row.users.verified ? " · verified profile" : ""}
                                </p>
                              ) : null}
                            </div>
                          </div>
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
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {formatDelivery(row.availability_mode)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatServicePrice(row)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatRating(row.rating_avg, row.review_count)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={requestTone(row.published ? "approved" : "pending")}>
                          {row.published ? "Published" : "Pending approval"}
                        </StatusBadge>
                        {row.is_featured ? (
                          <p className="mt-1 text-[10px] font-medium text-amber-700">Featured</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {row.published ? (
                            <button
                              type="button"
                              disabled={busy === row.id}
                              className="text-sm font-medium text-text-secondary disabled:opacity-50"
                              onClick={() => void approve(row.id, false)}
                            >
                              Unpublish
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy === row.id}
                              className="text-sm font-medium text-primary disabled:opacity-50"
                              onClick={() => void approve(row.id, true)}
                            >
                              Approve
                            </button>
                          )}
                          <Link
                            href={`/admin/services/${row.id}`}
                            className="text-sm font-medium text-primary"
                          >
                            Open
                          </Link>
                          <button
                            type="button"
                            disabled={busy === row.id}
                            className="text-sm font-medium text-red-600 disabled:opacity-50"
                            onClick={() => void remove(row)}
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
        ) : null}
      </AdminTableShell>
    </>
  );
}
