"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  AdminStatCard,
  AdminTableShell,
  type AdminRowMenuItem,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  newsCategories,
  newsMediaTypes,
  newsStatusLabel,
  newsStatuses,
  normalizeNewsStatusFilter,
  type NewsDirectoryResponse,
  type NewsDirectoryRow,
} from "@/lib/news";
import { adminFetch, deleteAdmin, postAdminResponse } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { formatDate } from "@/lib/utils";

export default function NewsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = can("news:write");

  const status = normalizeNewsStatusFilter(searchParams.get("status"));
  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || "all";
  const organizationId = searchParams.get("organization_id") || "";
  const launchOrg = searchParams.get("org") || searchParams.get("organization") || "";
  const mediaType = searchParams.get("media_type") || "all";
  const featuredFilter = searchParams.get("featured") || "all";
  const publishedFrom = searchParams.get("published_from") || "";
  const publishedTo = searchParams.get("published_to") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("page_size") || "40") || 40));
  const sort = searchParams.get("sort") || "recency";
  const order = searchParams.get("order") || "desc";

  const [payload, setPayload] = useState<NewsDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);


  const writeParams = useCallback(
    (patch: Record<string, string | null>, opts?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      if (opts?.resetPage !== false && !("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!launchOrg) return;
    router.replace(`/admin/news/new?organization_id=${encodeURIComponent(launchOrg)}`);
  }, [launchOrg, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status !== "all") params.set("status", status);
      if (category !== "all") params.set("category", category);
      if (organizationId) params.set("organization_id", organizationId);
      if (mediaType !== "all") params.set("media_type", mediaType);
      if (featuredFilter !== "all") params.set("featured", featuredFilter);
      if (publishedFrom) params.set("published_from", publishedFrom);
      if (publishedTo) params.set("published_to", publishedTo);
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      params.set("sort", sort);
      params.set("order", order);
      const res = await adminFetch(`/api/admin/news?${params}`);
      const json = (await res.json()) as NewsDirectoryResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load news");
      setPayload(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [
    category,
    featuredFilter,
    mediaType,
    order,
    organizationId,
    page,
    pageSize,
    publishedFrom,
    publishedTo,
    query,
    sort,
    status,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = payload?.data ?? [];
  const totals = payload?.totals ?? {};
  const filterMeta = payload?.filters;
  const filteredTotal = payload?.filtered_total ?? payload?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: Record<string, string | null> }> = [];
    if (status !== "all") {
      chips.push({
        key: "status",
        label: `Status: ${newsStatusLabel(status)}`,
        clear: { status: null },
      });
    }
    if (category !== "all") {
      chips.push({ key: "category", label: `Category: ${category}`, clear: { category: null } });
    }
    if (organizationId) {
      const name =
        filterMeta?.organizations?.find((o) => o.id === organizationId)?.name || organizationId;
      chips.push({
        key: "org",
        label: `Org: ${name}`,
        clear: { organization_id: null },
      });
    }
    if (mediaType !== "all") {
      const label = newsMediaTypes.find((m) => m.id === mediaType)?.label || mediaType;
      chips.push({
        key: "media",
        label: `Media: ${label}`,
        clear: { media_type: null },
      });
    }
    if (featuredFilter !== "all") {
      chips.push({
        key: "featured",
        label: featuredFilter === "featured" ? "Featured" : "Standard",
        clear: { featured: null },
      });
    }
    if (publishedFrom || publishedTo) {
      chips.push({
        key: "dates",
        label: `Dates: ${publishedFrom || "…"} → ${publishedTo || "…"}`,
        clear: { published_from: null, published_to: null },
      });
    }
    if (query.trim()) {
      chips.push({ key: "q", label: `Search: ${query.trim()}`, clear: { q: null } });
    }
    return chips;
  }, [
    category,
    featuredFilter,
    filterMeta?.organizations,
    mediaType,
    organizationId,
    publishedFrom,
    publishedTo,
    query,
    status,
  ]);

  const clearAllFilters = () => {
    writeParams({
      q: null,
      status: null,
      category: null,
      organization_id: null,
      media_type: null,
      featured: null,
      published_from: null,
      published_to: null,
      page: null,
    });
  };

  const runAction = async (row: NewsDirectoryRow, action: string) => {
    if (!canWrite) return;
    setBusyId(row.id);
    setError(null);
    try {
      await postAdminResponse(`/api/admin/news/${row.id}/actions`, { action });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const removeHard = async (row: NewsDirectoryRow) => {
    if (!window.confirm(`Permanently delete "${row.title}"? This cannot be undone.`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      await deleteAdmin(`/api/admin/news/${row.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const rowMenuItems = (row: NewsDirectoryRow): AdminRowMenuItem[] => {
    const statusLower = String(row.status || "").toLowerCase();
    const items: AdminRowMenuItem[] = [
      { id: "open", label: "Open / Edit", href: row.href || `/admin/news/${row.id}` },
    ];
    if (!canWrite) return items;
    if (statusLower === "draft") {
      items.push({
        id: "publish",
        label: "Publish",
        tone: "success",
        onClick: () => void runAction(row, "publish"),
      });
    }
    if (statusLower === "active" || statusLower === "published") {
      items.push({
        id: row.is_featured ? "unfeature" : "feature",
        label: row.is_featured ? "Remove featured" : "Feature on home",
        onClick: () => void runAction(row, row.is_featured ? "unfeature" : "feature"),
      });
    }
    if (statusLower !== "archived" && statusLower !== "archive" && statusLower !== "hidden") {
      items.push({
        id: "archive",
        label: "Archive",
        onClick: () => void runAction(row, "archive"),
      });
    } else {
      items.push({
        id: "restore",
        label: "Restore to draft",
        onClick: () => void runAction(row, "restore_draft"),
      });
      items.push({
        id: "republish",
        label: "Publish again",
        tone: "success",
        onClick: () => void runAction(row, "publish"),
      });
    }
    items.push({
      id: "delete",
      label: "Delete permanently",
      tone: "danger",
      separatorBefore: true,
      onClick: () => void removeHard(row),
    });
    return items;
  };

  return (
    <>
      <AdminPageHeader
        title="Sport News"
        description="Publish stories for the home feed. Filters persist in the URL so overview drill-downs stay selected."
        breadcrumbs={[
          { label: "Content", href: "/admin/content" },
          { label: "Sport News" },
        ]}
        actions={
          canWrite ? (
            <Link
              href="/admin/news/new"
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Add news
            </Link>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <AdminStatCard title="All (catalog)" value={`${totals.all ?? "-"}`} />
        <button
          type="button"
          className="text-left"
          onClick={() => writeParams({ status: "active" })}
        >
          <AdminStatCard title="Published" value={`${totals.published ?? "-"}`} />
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => writeParams({ status: "draft" })}
        >
          <AdminStatCard title="Draft" value={`${totals.draft ?? "-"}`} />
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => writeParams({ status: "archived" })}
        >
          <AdminStatCard title="Archived" value={`${totals.archived ?? "-"}`} />
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => writeParams({ featured: "featured", status: null })}
        >
          <AdminStatCard title="Featured" value={`${totals.featured ?? "-"}`} />
        </button>
      </div>
      <p className="mb-4 text-xs text-text-hint">
        Catalog totals match Content Overview definitions. Table below shows filtered results (
        {loading ? "…" : filteredTotal}).
      </p>

      {error ? (
        <div className="mb-4">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            className="-mt-2 mb-2 text-sm font-medium text-primary hover:underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <AdminFilterPanel>
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <div className="lg:col-span-2 xl:col-span-2">
            <AdminSearchInput
              value={query}
              onChange={(value) => writeParams({ q: value || null })}
              placeholder="Search headline, category, source"
            />
          </div>
          <AdminSelect
            value={status}
            onChange={(value) => writeParams({ status: value === "all" ? null : value })}
          >
            <option value="all">All statuses</option>
            {newsStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={category}
            onChange={(value) => writeParams({ category: value === "all" ? null : value })}
          >
            <option value="all">All categories</option>
            {(filterMeta?.categories?.length ? filterMeta.categories : [...newsCategories]).map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ),
            )}
          </AdminSelect>
          <AdminSelect
            value={mediaType}
            onChange={(value) => writeParams({ media_type: value === "all" ? null : value })}
          >
            <option value="all">All media</option>
            {newsMediaTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={featuredFilter}
            onChange={(value) => writeParams({ featured: value === "all" ? null : value })}
          >
            <option value="all">All placement</option>
            <option value="featured">Featured</option>
            <option value="standard">Standard</option>
          </AdminSelect>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminSelect
            value={organizationId || "all"}
            onChange={(value) =>
              writeParams({ organization_id: value === "all" ? null : value })
            }
          >
            <option value="all">All organizations</option>
            {(filterMeta?.organizations ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </AdminSelect>
          <label className="text-xs text-text-secondary">
            From
            <input
              type="date"
              value={publishedFrom}
              onChange={(e) => writeParams({ published_from: e.target.value || null })}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            />
          </label>
          <label className="text-xs text-text-secondary">
            To
            <input
              type="date"
              value={publishedTo}
              onChange={(e) => writeParams({ published_to: e.target.value || null })}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            />
          </label>
          <AdminSelect
            value={`${sort}:${order}`}
            onChange={(value) => {
              const [s, o] = value.split(":");
              writeParams({ sort: s || "recency", order: o || "desc" });
            }}
          >
            <option value="recency:desc">Newest first</option>
            <option value="recency:asc">Oldest first</option>
            <option value="updated:desc">Recently updated</option>
            <option value="title:asc">Title A–Z</option>
            <option value="likes:desc">Most liked</option>
            <option value="comments:desc">Most commented</option>
          </AdminSelect>
        </div>
        {activeChips.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => writeParams(chip.clear)}
                className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-text-secondary hover:bg-muted"
              >
                {chip.label} ×
              </button>
            ))}
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={clearAllFilters}
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </AdminFilterPanel>

      {loading ? <AdminLoadingRow label="Loading articles…" /> : null}

      <AdminTableShell>
        {!loading && rows.length === 0 ? (
          <AdminEmpty
            title={activeChips.length ? "No matching articles" : "No articles yet"}
            description={
              activeChips.length
                ? "Try clearing filters or adjusting the date range."
                : "Create sport news to show on the home feed."
            }
          />
        ) : null}
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Article</th>
                  <th className="px-4 py-3 font-semibold">Media</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Placement</th>
                  <th className="px-4 py-3 font-semibold">Engagement</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const thumb = (row.thumbnail || "").trim();
                  const dateLabel = row.display_date?.label || "Date";
                  const dateAt = row.display_date?.at;
                  const href = row.href || `/admin/news/${row.id}`;
                  return (
                    <tr
                      key={row.id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                      onClick={() => router.push(href)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(href);
                        }
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              className="h-12 w-16 rounded-md object-cover bg-muted"
                            />
                          ) : (
                            <div className="grid h-12 w-16 place-items-center rounded-md bg-muted text-[10px] text-text-hint">
                              {row.media_label || row.media_type}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-text-primary">{row.title}</p>
                            <p className="mt-0.5 truncate text-xs text-text-secondary">
                              {row.organization_name || "No organization"}
                              {row.source?.trim() ? ` · ${row.source.trim()}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-text-secondary">
                            {row.media_label || row.media_type}
                          </span>
                          {row.has_soundtrack ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                              Soundtrack
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.category || "-"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={requestTone(row.status)}>
                          {row.status_label || newsStatusLabel(row.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {row.featured_label || (row.is_featured ? "Featured" : "Standard")}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        <span title="Lifetime engagement">
                          Likes {row.engagement?.likes ?? 0} · Comments{" "}
                          {row.engagement?.comments ?? 0} · Saves {row.engagement?.saves ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        <div className="font-medium text-text-primary">{dateLabel}</div>
                        <div>{dateAt ? formatDate(dateAt) : "-"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {row.updated_at ? formatDate(row.updated_at) : "-"}
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <AdminRowMenu
                          items={rowMenuItems(row)}
                          disabled={busyId === row.id}
                          aria-label={`Actions for ${row.title}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {!loading && filteredTotal > pageSize ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
            <p className="text-text-secondary">
              Page {page} of {totalPages} · {filteredTotal} result
              {filteredTotal === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                onClick={() => writeParams({ page: String(page - 1) }, { resetPage: false })}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                onClick={() => writeParams({ page: String(page + 1) }, { resetPage: false })}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </AdminTableShell>

    </>
  );
}
