"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminCardsListToggle,
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminReloadButton,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  AdminStatCard,
  AdminTableLoading,
  AdminTableShell,
  type AdminRowMenuItem,
} from "@/components/admin-layout";
import type { DirectoryView } from "@/lib/directory-view";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { deleteAdmin, postAdminResponse } from "@/lib/hooks";
import {
  DELIVERY_MODES,
  PRICING_TYPES,
  PROVIDER_VERIFICATION_NOTE,
  formatDelivery,
  formatDuration,
  formatPublicationStatus,
  formatRating,
  formatServicePrice,
  publicationTone,
  providerVerificationLabel,
} from "@/lib/service-pricing";
import { serviceCoverUrl } from "@/lib/services-media";
import type { ServiceCategory, ServiceRow, ServiceSubcategory } from "@/lib/types";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";

type ListRow = ServiceRow & {
  href?: string;
  publication_label?: string;
  delivery_label?: string;
  price_label?: string;
  provider_verification_label?: string;
  rating_label?: string;
  booking_count?: number;
};

type SummaryScope = {
  global?: { services?: number; published?: number; pending?: number; label?: string };
  filtered?: { services?: number; pending?: number; label?: string };
};

type ServicesListData = {
  rows: ListRow[];
  total: number;
  categories: ServiceCategory[];
  subcategories: ServiceSubcategory[];
  summary: SummaryScope;
  definitions: Record<string, string>;
};

function catalogLabel(
  id: string | null | undefined,
  rows: { id: string; label: string; emoji?: string }[],
  embedded?: { label: string; emoji?: string } | null,
) {
  if (embedded?.label) return `${embedded.emoji ?? ""} ${embedded.label}`.trim();
  const match = rows.find((item) => item.id === id);
  return match ? `${match.emoji ?? ""} ${match.label}`.trim() : "-";
}

export default function ServicesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = can("services:write");

  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || "all";
  const subcategory = searchParams.get("subcategory") || "all";
  const published = searchParams.get("published") || "all";
  const delivery = searchParams.get("delivery") || "all";
  const pricingType = searchParams.get("pricing_type") || "all";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const summaryMode = searchParams.get("summary") === "filtered" ? "filtered" : "global";
  // URL keeps legacy values: list = cards layout, table = list/table layout.
  const layoutView: DirectoryView =
    searchParams.get("view") === "table" ? "list" : "cards";
  const view = layoutView === "list" ? "table" : "list";

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const writeParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in patch)) next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const {
    data: listData,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<ServicesListData>({
    key: adminCacheKey([
      "services",
      "list",
      page,
      query,
      category,
      subcategory,
      published,
      delivery,
      pricingType,
    ]),
    fetcher: async () => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (category !== "all") params.set("category", category);
      if (subcategory !== "all") params.set("subcategory", subcategory);
      if (published !== "all") params.set("published", published);
      if (delivery !== "all") params.set("delivery", delivery);
      if (pricingType !== "all") params.set("pricing_type", pricingType);
      params.set("page", String(page));
      params.set("page_size", "40");

      const response = await fetch(`/api/admin/services?${params}`, {
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        data?: ListRow[];
        total?: number;
        categories?: ServiceCategory[];
        subcategories?: ServiceSubcategory[];
        summary_scope?: SummaryScope;
        definitions?: Record<string, string>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to load services");
      return {
        rows: payload.data ?? [],
        total: payload.total ?? payload.data?.length ?? 0,
        categories: payload.categories ?? [],
        subcategories: payload.subcategories ?? [],
        summary: payload.summary_scope ?? {},
        definitions: payload.definitions ?? {},
      };
    },
  });

  const rows = useMemo(() => listData?.rows ?? [], [listData]);
  const total = listData?.total ?? 0;
  const summary = listData?.summary ?? {};
  const categories = listData?.categories ?? [];
  const subcategories = listData?.subcategories ?? [];
  const error = actionError ?? loadError;
  const listOk = listData != null && !loadError;

  const categorySubs = subcategories.filter((s) =>
    category === "all" ? true : s.category_id === category,
  );
  const selectedPending = rows.filter((r) => selected.has(r.id) && !r.published);
  const scope = summaryMode === "filtered" ? summary.filtered : summary.global;
  const pageCount = Math.max(1, Math.ceil(total / 40));

  const openDetail = (id: string) => {
    const returnTo = `${pathname}?${searchParams.toString()}`;
    sessionStorage.setItem("services-return", returnTo);
    router.push(`/admin/services/${id}`);
  };

  const moderate = async (id: string, action: string) => {
    let reason: string | undefined;
    let fields: string[] | undefined;
    if (["unpublish", "reject", "request_changes"].includes(action)) {
      reason = window.prompt(`Reason for ${action.replace(/_/g, " ")} (required):`) || undefined;
      if (!reason?.trim()) return;
    }
    if (action === "request_changes") {
      const raw =
        window.prompt(
          "Fields to update (comma-separated, e.g. title, cover, price, description):",
        ) || "";
      fields = raw
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      if (!fields.length) return;
    }
    if (action === "approve") {
      if (
        !window.confirm(
          "Approve and publish this listing immediately? It will become visible in the marketplace.",
        )
      ) {
        return;
      }
    }
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await postAdminResponse(`/api/admin/services/${id}/moderate`, {
        action,
        reason,
        fields,
      });
      setNotice(
        action === "approve"
          ? "Approved and published."
          : `Action “${action.replace(/_/g, " ")}” applied.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const approveSelected = async () => {
    if (!selectedPending.length) return;
    if (
      !window.confirm(
        `Approve & publish ${selectedPending.length} selected listing(s)?\n\n${selectedPending
          .slice(0, 8)
          .map((r) => `• ${r.title}`)
          .join("\n")}${selectedPending.length > 8 ? "\n…" : ""}\n\nEach listing is revalidated individually.`,
      )
    ) {
      return;
    }
    setBusy("selected");
    setError(null);
    try {
      const result = await postAdminResponse<{
        outcomes?: Array<{ id: string; ok: boolean; message?: string }>;
        approved?: string[];
        failed?: unknown[];
      }>("/api/admin/services", {
        action: "approve_selected",
        ids: selectedPending.map((r) => r.id),
      });
      const failed = result.failed?.length ?? 0;
      const ok = (result.approved ?? []).length;
      setNotice(
        failed
          ? `Approved ${ok}; ${failed} failed. Check outcomes and retry.`
          : `Approved and published ${ok} listing(s).`,
      );
      setSelected(new Set());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  };

  const archive = async (row: ListRow) => {
    if (
      !window.confirm(
        `Archive “${row.title}”? Listings with bookings/payments are unpublished (not hard-deleted).`,
      )
    ) {
      return;
    }
    setBusy(row.id);
    try {
      const result = await deleteAdmin(`/api/admin/services/${row.id}`);
      setNotice(
        result?.archived
          ? result.message || "Archived (bookings and payments preserved)."
          : "Deleted.",
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setBusy(null);
    }
  };

  const serviceMenuItems = (row: ListRow): AdminRowMenuItem[] => {
    const items: AdminRowMenuItem[] = [
      { id: "open", label: "Open", onClick: () => openDetail(row.id) },
    ];
    if (!canWrite) return items;
    if (!row.published) {
      items.push({
        id: "approve",
        label: "Approve & publish",
        tone: "success",
        onClick: () => void moderate(row.id, "approve"),
      });
      items.push({
        id: "request_changes",
        label: "Request changes",
        onClick: () => void moderate(row.id, "request_changes"),
      });
    } else {
      items.push({
        id: "unpublish",
        label: "Unpublish",
        onClick: () => void moderate(row.id, "unpublish"),
      });
    }
    items.push({
      id: "feature",
      label: row.is_featured ? "Unfeature" : "Feature",
      onClick: () => void moderate(row.id, row.is_featured ? "unfeature" : "feature"),
    });
    items.push({
      id: "archive",
      label: "Archive",
      tone: "danger",
      separatorBefore: true,
      onClick: () => void archive(row),
    });
    return items;
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const headerCount = loading
    ? "Loading…"
    : listOk
      ? `${scope?.services ?? total} ${summaryMode === "filtered" ? "matching" : "total"} · ${scope?.pending ?? "-"} pending`
      : "-";

  return (
    <>
      <AdminPageHeader
        title="Services"
        description={headerCount}
        stackOnSmall
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => void refresh()}
            />
            <Link
              href="/admin/services/settings"
              className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-text-secondary hover:text-foreground"
            >
              Settings
            </Link>
            <AdminCardsListToggle
              value={layoutView}
              onChange={(next) =>
                writeParams({
                  view: next === "list" ? "table" : "list",
                  page: null,
                })
              }
            />
            {canWrite && selectedPending.length > 0 ? (
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
            ) : null}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <AdminStatCard
          title={summaryMode === "filtered" ? "Matching" : "All services"}
          value={loading ? "…" : String(scope?.services ?? "-")}
        />
        <AdminStatCard
          title="Pending review"
          value={loading ? "…" : String(scope?.pending ?? "-")}
        />
        <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <p className="mb-1 text-sm font-semibold text-text-secondary">Summary scope</p>
          <p className="truncate text-2xl font-bold tabular-nums text-text-primary">
            {summaryMode === "filtered" ? "Filtered" : "All"}
          </p>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-primary"
            onClick={() =>
              writeParams({
                summary: summaryMode === "filtered" ? null : "filtered",
              })
            }
          >
            Switch to {summaryMode === "filtered" ? "all" : "filtered"}
          </button>
        </div>
      </div>
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AdminSearchInput
            value={query}
            onChange={(value) => writeParams({ q: value || null })}
            placeholder="Search title, provider, location"
          />
          <AdminSelect value={category} onChange={(value) => writeParams({ category: value, subcategory: null })}>
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.emoji} {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={subcategory} onChange={(value) => writeParams({ subcategory: value })}>
            <option value="all">All subcategories</option>
            {categorySubs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.emoji} {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={published} onChange={(value) => writeParams({ published: value })}>
            <option value="all">All review states</option>
            <option value="pending">Pending review</option>
            <option value="yes">Published</option>
          </AdminSelect>
          <AdminSelect value={delivery} onChange={(value) => writeParams({ delivery: value })}>
            <option value="all">All delivery modes</option>
            {DELIVERY_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value="on_request">On request (legacy)</option>
          </AdminSelect>
          <AdminSelect
            value={pricingType}
            onChange={(value) => writeParams({ pricing_type: value })}
          >
            <option value="all">All pricing</option>
            {PRICING_TYPES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>

      {notice ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      {error ? (
        <div className="space-y-2">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium"
          >
            Retry
          </button>
        </div>
      ) : null}

      <AdminTableShell>
        {view === "list" && loading ? (
          <AdminLoadingRow label="Loading services…" compact className="py-10" />
        ) : null}

        {view === "list" && !loading && listOk && rows.length === 0 && !error ? (
          <AdminEmpty
            title={published === "pending" ? "No pending listings" : "No services"}
            description={
              published === "pending"
                ? "New listings wait here until an admin approves them."
                : "Listings from the superapp marketplace appear here. Adjust filters and Reload."
            }
          />
        ) : null}

        {view === "list" && !loading && rows.length > 0 ? (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const cover = serviceCoverUrl(row);
              return (
                <li key={row.id} className="relative flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 gap-3">
                    {!row.published && canWrite ? (
                      <input
                        type="checkbox"
                        className="mt-2 shrink-0"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`Select ${row.title}`}
                      />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => openDetail(row.id)}
                      className="flex min-w-0 flex-1 gap-3 text-left"
                    >
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt=""
                          className="aspect-[4/3] w-24 shrink-0 rounded-md object-cover bg-muted"
                        />
                      ) : (
                        <div className="grid aspect-[4/3] w-24 shrink-0 place-items-center rounded-md bg-muted text-[10px] text-text-hint">
                          No photo
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary">{row.title}</p>
                        <p className="text-xs text-text-secondary">
                          {[
                            [row.city, row.country].filter(Boolean).join(", "),
                            formatDuration(row.duration_minutes),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {catalogLabel(row.category_id, categories, row.category)}
                          {row.subcategory || row.subcategory_id
                            ? ` · ${catalogLabel(row.subcategory_id, subcategories, row.subcategory)}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-text-hint">
                          {row.delivery_label || formatDelivery(row.availability_mode)} ·{" "}
                          {row.price_label || formatServicePrice(row)}
                        </p>
                      </div>
                    </button>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
                    {row.users ? (
                      <Link
                        href={`/admin/people/${row.users.id}`}
                        className="flex items-center gap-2"
                        title={PROVIDER_VERIFICATION_NOTE}
                      >
                        {row.users.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.users.avatar_url}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-primary">
                            {(row.users.display_name || "?").slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="hidden max-w-[8rem] truncate text-sm lg:inline">
                          {row.users.display_name}
                          <span className="block text-[10px] text-text-hint">
                            {row.provider_verification_label ||
                              providerVerificationLabel(row.users.verified)}
                          </span>
                        </span>
                      </Link>
                    ) : null}

                    <div className="text-right text-xs text-text-secondary">
                      <p>{row.rating_label || formatRating(row.rating_avg, row.review_count)}</p>
                      {row.is_featured ? (
                        <p className="font-medium text-amber-700">Featured</p>
                      ) : null}
                    </div>

                    <StatusBadge tone={requestTone(publicationTone(row.published))}>
                      {row.publication_label || formatPublicationStatus(row.published)}
                    </StatusBadge>

                    <AdminRowMenu
                      items={serviceMenuItems(row)}
                      disabled={busy === row.id}
                      aria-label={`Actions for ${row.title}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {view === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-3 py-3">Service</th>
                  <th className="px-3 py-3">Provider</th>
                  <th className="px-3 py-3">Price</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <AdminTableLoading colSpan={5} label="Loading services…" />
                ) : listOk && rows.length === 0 && !error ? (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <AdminEmpty
                        title={published === "pending" ? "No pending listings" : "No services"}
                        description={
                          published === "pending"
                            ? "New listings wait here until an admin approves them."
                            : "Listings from the superapp marketplace appear here. Adjust filters and Reload."
                        }
                      />
                    </td>
                  </tr>
                ) : rows.map((row) => (
                  <tr
                    key={row.id}
                    role="link"
                    tabIndex={0}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                    onClick={() => openDetail(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDetail(row.id);
                      }
                    }}
                  >
                    <td className="px-3 py-3">
                      <p className="font-medium text-text-primary">{row.title}</p>
                      <p className="text-xs text-text-secondary">
                        {formatDelivery(row.availability_mode)}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-text-secondary">
                      {row.users?.display_name || "-"}
                    </td>
                    <td className="px-3 py-3">{formatServicePrice(row)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={requestTone(publicationTone(row.published))}>
                        {formatPublicationStatus(row.published)}
                      </StatusBadge>
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <AdminRowMenu
                        items={serviceMenuItems(row)}
                        disabled={busy === row.id}
                        aria-label={`Actions for ${row.title}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {listOk && total > 40 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-text-secondary">
              Page {page} of {pageCount} · {total} matching
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => writeParams({ page: String(page - 1) })}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => writeParams({ page: String(page + 1) })}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
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

