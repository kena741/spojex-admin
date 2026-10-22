"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminReloadButton,
  AdminModal,
  AdminModalFooter,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  AdminStatCard,
  AdminTableLoading,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { adminCacheKey, invalidateAdminCache } from "@/lib/admin-session-cache";
import { adminFetch, deleteAdmin, postAdmin, postAdminResponse } from "@/lib/hooks";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import {
  ELIGIBLE_ROLE_OPTIONS,
  emptyOpportunityDraft,
  formatOpportunityFee,
  opportunityStatusLabel,
  opportunityStatuses,
  opportunityStatusTone,
  validateOpportunityDraft,
  type OpportunityDraft,
  type OpportunityRow,
} from "@/lib/opportunities";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { formatDateTime } from "@/lib/utils";

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

type ListRow = OpportunityRow & {
  verified_collections?: string;
  href_applications?: string;
  href_waitlist?: string;
};

type SummaryScope = {
  global?: {
    opportunities?: number;
    applicants?: number;
    waitlist?: number;
    verified_collections?: string;
    label?: string;
  };
  filtered?: {
    opportunities?: number;
    applicants?: number;
    waitlist?: number;
    verified_collections?: string;
    label?: string;
  };
};

type OpportunitiesListData = {
  rows: ListRow[];
  total: number;
  summary: SummaryScope;
  definitions: Record<string, string>;
};

export default function OpportunitiesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = can("opportunities:write");

  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "all";
  const published = searchParams.get("published") || "all";
  const category = searchParams.get("category") || "";
  const organizer = searchParams.get("organizer") || "";
  const country = searchParams.get("country") || "";
  const deadline = searchParams.get("deadline") || "all";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const summaryMode = searchParams.get("summary") === "filtered" ? "filtered" : "global";

  const [actionError, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<OpportunityDraft>(emptyOpportunityDraft());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const writeParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
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
  } = useAdminQuery<OpportunitiesListData>({
    key: adminCacheKey([
      "opportunities",
      "list",
      page,
      q,
      status,
      published,
      category,
      organizer,
      country,
      deadline,
    ]),
    fetcher: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "40",
        sort: "updated_at",
        order: "desc",
      });
      if (q) params.set("q", q);
      if (status !== "all") params.set("status", status);
      if (published !== "all") params.set("published", published);
      if (category) params.set("category", category);
      if (organizer) params.set("organizer", organizer);
      if (country) params.set("country", country);
      if (deadline !== "all") params.set("deadline", deadline);

      const response = await adminFetch(`/api/admin/opportunities?${params}`);
      const payload = (await response.json()) as {
        data?: ListRow[];
        total?: number;
        summary_scope?: SummaryScope;
        definitions?: Record<string, string>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to load");
      return {
        rows: payload.data ?? [],
        total: payload.total ?? 0,
        summary: payload.summary_scope ?? {},
        definitions: payload.definitions ?? {},
      };
    },
  });

  const rows = useMemo(() => (loadError ? [] : (listData?.rows ?? [])), [listData, loadError]);
  const total = listData?.total ?? 0;
  const summary = listData?.summary ?? {};
  const definitions = listData?.definitions ?? {};
  const error = actionError ?? loadError;
  const ok = listData != null && !loadError;

  const openCreate = () => {
    setDraft(emptyOpportunityDraft());
    setModalOpen(true);
  };

  const rememberReturn = () => {
    try {
      sessionStorage.setItem(
        "opportunities-return",
        `${pathname}?${searchParams.toString()}`,
      );
    } catch {
      /* ignore */
    }
  };

  const detailHref = (id: string, tab?: string) => {
    rememberReturn();
    return tab ? `/admin/opportunities/${id}?tab=${tab}` : `/admin/opportunities/${id}`;
  };

  const save = async () => {
    if (!canWrite) return;
    const validation = validateOpportunityDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await adminFetch("/api/admin/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Create failed");
      invalidateAdminCache("opportunities");
      setModalOpen(false);
      const created = payload.data;
      if (created?.id) {
        rememberReturn();
        router.push(`/admin/opportunities/${created.id}`);
      } else await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, title: string) => {
    if (
      !window.confirm(
        `Archive “${title}”? Opportunities with applications/payments are unpublished and closed (not hard-deleted).`,
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const result = (await deleteAdmin(`/api/admin/opportunities/${id}`)) as {
        archived?: boolean;
        message?: string;
      };
      setNotice(
        result?.archived
          ? result.message || "Archived (applications and payments preserved)."
          : "Deleted.",
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setBusyId(null);
    }
  };

  const processSchedules = async () => {
    if (!canWrite) return;
    setProcessing(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await postAdminResponse<{
        schedules?: { opened?: number; closed?: number; opened_ids?: string[] };
        opened?: number;
        closed?: number;
        notifies?: unknown[];
        behavior?: string;
      }>("/api/admin/opportunities/process-schedules", {});
      const opened = payload.schedules?.opened ?? payload.opened ?? 0;
      const closed = payload.schedules?.closed ?? payload.closed ?? 0;
      setNotice(
        `Schedules processed: opened ${opened}, closed ${closed}. Waitlist notified for newly opened (deduped).`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Schedule processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const scope = summaryMode === "filtered" ? summary.filtered : summary.global;

  return (
    <>
      <AdminPageHeader
        title="Opportunities"
        description="Trials, jobs, and scouting listings - publication, applications, and interest waitlists are separate"
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => void refresh()}
            />
            {canWrite ? (
              <>
              <button
                type="button"
                onClick={() => void processSchedules()}
                disabled={processing}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                title={definitions.waitlist}
              >
                {processing ? "Processing…" : "Process schedules"}
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                New opportunity
              </button>
              </>
            ) : null}
          </div>
        }
      />

      {error ? (
        <div className="mb-4 space-y-2">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium"
          >
            Retry
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-text-hint">
        <span>Summary:</span>
        <button
          type="button"
          onClick={() => writeParams({ summary: null })}
          className={summaryMode === "global" ? "font-medium text-primary" : "hover:underline"}
        >
          All opportunities
        </button>
        <span>·</span>
        <button
          type="button"
          onClick={() => writeParams({ summary: "filtered" })}
          className={summaryMode === "filtered" ? "font-medium text-primary" : "hover:underline"}
        >
          Filtered results
        </button>
        <span className="text-text-hint">({scope?.label})</span>
      </div>

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard title="Opportunities" value={`${scope?.opportunities ?? 0}`} />
        <AdminStatCard title="Applicants" value={`${scope?.applicants ?? 0}`} />
        <AdminStatCard
          title="Interest waitlist"
          value={`${scope?.waitlist ?? 0}`}
        />
        <AdminStatCard
          title="Verified fee collections"
          value={`ETB ${Number(scope?.verified_collections || 0).toLocaleString()}`}
        />
      </section>
      <p className="mb-4 text-[11px] text-text-hint">
        {definitions.verified_collections ||
          "Verified fee collections are customer application fees, not platform commission."}{" "}
        {definitions.waitlist ||
          "Waitlist = interest before applications open (not capacity overflow)."}
      </p>

      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <AdminSearchInput
            value={q}
            onChange={(value) => writeParams({ q: value || null, page: "1" })}
            placeholder="Search title, category, organizer, location"
          />
          <AdminSelect
            value={status}
            onChange={(value) => writeParams({ status: value, page: "1" })}
          >
            <option value="all">All application statuses</option>
            {opportunityStatuses.map((item) => (
              <option key={item} value={item}>
                {opportunityStatusLabel(item)}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={published}
            onChange={(value) => writeParams({ published: value, page: "1" })}
          >
            <option value="all">All visibility</option>
            <option value="yes">Published</option>
            <option value="no">Drafts</option>
          </AdminSelect>
          <AdminSelect
            value={deadline}
            onChange={(value) => writeParams({ deadline: value, page: "1" })}
          >
            <option value="all">Any deadline</option>
            <option value="upcoming">Deadline upcoming</option>
            <option value="past">Deadline past</option>
            <option value="none">No deadline</option>
          </AdminSelect>
          <input
            value={category}
            onChange={(e) => writeParams({ category: e.target.value || null, page: "1" })}
            placeholder="Category"
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          />
          <input
            value={organizer}
            onChange={(e) => writeParams({ organizer: e.target.value || null, page: "1" })}
            placeholder="Organizer"
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          />
          <input
            value={country}
            onChange={(e) => writeParams({ country: e.target.value || null, page: "1" })}
            placeholder="Country"
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          />
        </div>
      </AdminFilterPanel>

      <AdminTableShell>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Opportunity</th>
                  <th className="px-4 py-3 font-semibold">Publication</th>
                  <th className="px-4 py-3 font-semibold">Applications</th>
                  <th className="px-4 py-3 font-semibold">Opens / deadline</th>
                  <th className="px-4 py-3 font-semibold">Fee</th>
                  <th className="px-4 py-3 font-semibold">Applicants</th>
                  <th className="px-4 py-3 font-semibold">Waitlist</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <AdminTableLoading colSpan={8} label="Loading opportunities…" />
                ) : ok && rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <AdminEmpty
                        title={total === 0 && !q ? "No opportunities yet" : "No matching opportunities"}
                        description={
                          !q && status === "all"
                            ? "Create a trial, job, or scouting listing to get started."
                            : "Try a different search or filter, then Reload."
                        }
                      />
                    </td>
                  </tr>
                ) : rows.map((row) => {
                  const cover = toBackendMediaUrl(row.cover_image_url);
                  return (
                    <tr
                      key={row.id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                      onClick={() => {
                        rememberReturn();
                        router.push(detailHref(row.id));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          rememberReturn();
                          router.push(detailHref(row.id));
                        }
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover}
                              alt=""
                              className="h-11 w-16 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <div className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-text-secondary">
                              No img
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-text-primary">{row.title}</p>
                            <p className="truncate text-xs text-text-secondary">
                              {[row.category, row.organizer, row.location, row.country]
                                .filter(Boolean)
                                .join(" · ") || "-"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={row.is_published ? "success" : "warning"}>
                          {row.is_published ? "Published" : "Draft"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={opportunityStatusTone(row.status)}>
                          {opportunityStatusLabel(row.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        <p>
                          Open{" "}
                          {row.application_opens_at
                            ? formatDateTime(row.application_opens_at)
                            : "-"}
                        </p>
                        <p className="text-text-hint">
                          Due{" "}
                          {row.application_deadline
                            ? formatDateTime(row.application_deadline)
                            : "-"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatOpportunityFee(row.fee_type, row.fee_amount)}
                        {row.max_applicants != null ? (
                          <p className="text-[10px] text-text-hint">
                            Cap {row.max_applicants} · {row.applicant_count ?? 0} in
                          </p>
                        ) : null}
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Link
                          href={
                            row.href_applications ||
                            detailHref(row.id, "applications")
                          }
                          onClick={rememberReturn}
                          className="tabular-nums font-medium text-primary hover:underline"
                        >
                          {row.applicant_count ?? 0}
                        </Link>
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Link
                          href={row.href_waitlist || detailHref(row.id, "waitlist")}
                          onClick={rememberReturn}
                          className="tabular-nums font-medium text-primary hover:underline"
                        >
                          {row.waitlist_count ?? 0}
                        </Link>
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <AdminRowMenu
                          disabled={busyId === row.id}
                          aria-label={`Actions for ${row.title}`}
                          items={[
                            {
                              id: "manage",
                              label: "Manage",
                              href: detailHref(row.id),
                              onClick: rememberReturn,
                            },
                            ...(canWrite
                              ? [
                                  {
                                    id: "archive",
                                    label: "Archive",
                                    tone: "danger" as const,
                                    separatorBefore: true,
                                    onClick: () => void remove(row.id, row.title),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </AdminTableShell>

      {total > 40 ? (
        <div className="mt-3 flex items-center justify-between text-xs">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => writeParams({ page: String(page - 1) })}
            className="rounded border border-border px-2 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} · {total} total
          </span>
          <button
            type="button"
            disabled={page * 40 >= total}
            onClick={() => writeParams({ page: String(page + 1) })}
            className="rounded border border-border px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}

      <AdminModal
        open={modalOpen}
        onClose={() => {
          if (saving) return;
          setModalOpen(false);
        }}
        title="New opportunity"
        className="max-w-2xl"
        footer={
          <AdminModalFooter
            onCancel={() => setModalOpen(false)}
            onSave={() => void save()}
            saving={saving}
            saveLabel="Create"
          />
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Title</span>
            <input
              className={fieldClass}
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Category</span>
            <input
              className={fieldClass}
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Organizer</span>
            <input
              className={fieldClass}
              value={draft.organizer}
              onChange={(e) => setDraft((d) => ({ ...d, organizer: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Fee type</span>
            <select
              className={fieldClass}
              value={draft.fee_type}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  fee_type: e.target.value as OpportunityDraft["fee_type"],
                }))
              }
            >
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          {draft.fee_type === "paid" ? (
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Fee amount (ETB)</span>
              <input
                className={fieldClass}
                value={draft.fee_amount}
                onChange={(e) => setDraft((d) => ({ ...d, fee_amount: e.target.value }))}
              />
            </label>
          ) : null}
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">
              Eligible roles (empty = all roles)
            </span>
            <div className="flex flex-wrap gap-2">
              {ELIGIBLE_ROLE_OPTIONS.map((role) => {
                const on = draft.eligible_roles.includes(role.value);
                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => {
                        const set = new Set(prev.eligible_roles);
                        if (set.has(role.value)) set.delete(role.value);
                        else set.add(role.value);
                        return { ...prev, eligible_roles: [...set] };
                      })
                    }
                    className={`rounded-md border px-2 py-1 text-xs ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.is_published}
              onChange={(e) => setDraft((d) => ({ ...d, is_published: e.target.checked }))}
            />
            Publish immediately
          </label>
        </div>
      </AdminModal>
    </>
  );
}
