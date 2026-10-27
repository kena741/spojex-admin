"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminReloadButton,
  AdminSearchInput,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import VerificationRequirementsEditor from "@/components/verification-requirements-editor";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { patchAdmin } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useAdminUiState } from "@/lib/use-admin-ui-state";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { IdentityVerificationRequestRow } from "@/lib/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { verificationDocLabel, verificationStatusLabel } from "@/lib/verification";
import { verificationStepLabel } from "@/lib/verification-docs";

const QUEUE_FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "in_review", label: "In Review" },
  { id: "needs_info", label: "Needs info" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
] as const;

type QueueRow = IdentityVerificationRequestRow & {
  verification_scope?: string;
  missing_docs?: boolean;
  missing_required_count?: number;
  document_count?: number;
  queue_facet?: string;
  reviewer?: { id?: string | null; display_name?: string | null } | null;
  users?: IdentityVerificationRequestRow["users"] & { email?: string | null };
};

type DetailRow = QueueRow & {
  role_requirements?: IdentityVerificationRequestRow["role_requirements"];
  identity_verification_documents?: IdentityVerificationRequestRow["identity_verification_documents"];
  prior_submissions?: Array<{
    id: string;
    status: string;
    review_note?: string;
    reviewed_at?: string | null;
    created_at: string;
  }>;
  timeline?: Array<{ at?: string; action?: string; label?: string }>;
  internal_notes?: string;
  applicant_feedback?: string;
  missing_required?: Array<{ slug: string; label: string }>;
  requirements_source?: string;
};

type QueueCounts = {
  pending?: number;
  pending_all?: number;
  in_review?: number;
  needs_info?: number;
  approved?: number;
  rejected?: number;
  total?: number;
  oldest_pending_at?: string | null;
};

function requestAgeLabel(createdAt: string) {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return "-";
  const hours = Math.max(0, (Date.now() - t) / 36e5);
  if (hours < 24) return `${Math.round(hours)}h waiting`;
  return `${Math.round(hours / 24)}d waiting`;
}

function docReviewState(
  requestStatus: string,
  hasApplicantNote: boolean,
): "submitted" | "accepted" | "needs_replacement" | "rejected" {
  const s = requestStatus.toLowerCase();
  if (s === "approved") return "accepted";
  if (s === "rejected") return "rejected";
  if (hasApplicantNote) return "needs_replacement";
  return "submitted";
}

export default function VerificationCenterPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canVerify = can("users:verify");
  const canReadDocs = can("profiles:read");

  const tab = searchParams.get("tab") === "requirements" ? "requirements" : "requests";
  const statusFilter = searchParams.get("status") || "all";
  const selectedId = searchParams.get("id") || "";
  const roleFilter = searchParams.get("role") || "all";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);

  const [actionError, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useAdminUiState("verifications:query", searchParams.get("q") || "");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [applicantNote, setApplicantNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const writeParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const trimmedQuery = debouncedQuery.trim();
  const {
    data: queueData,
    loading,
    refreshing,
    error: queueError,
    refresh: loadQueue,
  } = useAdminQuery<{
    rows: QueueRow[];
    total: number;
    counts: QueueCounts;
    countsScope: string;
  }>({
    key: adminCacheKey(["verifications", "queue", statusFilter, page, trimmedQuery, roleFilter]),
    enabled: tab === "requests",
    fetcher: async () => {
      setErrorStatus(null);
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("page_size", "40");
      if (trimmedQuery) params.set("q", trimmedQuery);
      if (roleFilter !== "all") params.set("role", roleFilter);

      const response = await fetch(`/api/admin/verifications?${params}`, {
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        data?: QueueRow[];
        total?: number;
        counts?: QueueCounts;
        counts_scope?: string;
      };

      if (response.status === 401 || response.status === 403) {
        setErrorStatus(response.status);
        throw new Error(payload.error || "Permission denied");
      }
      if (!response.ok) {
        setErrorStatus(response.status);
        throw new Error(payload.error || "Failed to load verification queue");
      }

      const data = payload.data ?? [];
      return {
        rows: data,
        total: payload.total ?? data.length,
        counts: payload.counts ?? {},
        countsScope: payload.counts_scope || "global",
      };
    },
  });
  const rows = useMemo(() => (queueError ? [] : (queueData?.rows ?? [])), [queueData, queueError]);
  const total = queueError ? 0 : (queueData?.total ?? 0);
  const counts: QueueCounts = queueData?.counts ?? {};
  const countsScope = queueData?.countsScope ?? "global";
  const loadState: "idle" | "ok" | "empty" | "denied" | "failed" = queueError
    ? errorStatus === 401 || errorStatus === 403
      ? "denied"
      : "failed"
    : queueData
      ? rows.length === 0
        ? "empty"
        : "ok"
      : "idle";

  const {
    data: detailData,
    loading: detailLoading,
    error: detailError,
    refresh: loadDetail,
  } = useAdminQuery<DetailRow | null>({
    key: selectedId ? adminCacheKey(["verifications", "detail", selectedId]) : null,
    enabled: tab === "requests" && Boolean(selectedId),
    fetcher: async () => {
      const response = await fetch(`/api/admin/verifications/${selectedId}`, {
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        error?: string;
        data?: DetailRow;
      };
      if (response.status === 401 || response.status === 403) {
        throw new Error(payload.error || "Permission denied");
      }
      if (!response.ok) throw new Error(payload.error || "Failed to load request");
      return payload.data ?? null;
    },
  });
  const selected =
    tab === "requests" && selectedId && detailData?.id === selectedId && !detailError
      ? detailData
      : null;
  const error = actionError || queueError || detailError;

  // Seed note editors whenever a (new or refreshed) detail payload arrives.
  useEffect(() => {
    setApplicantNote(selected?.applicant_feedback || selected?.review_note || "");
    setInternalNote(selected?.internal_notes || selected?.notes || "");
  }, [selected]);

  useEffect(() => {
    if (tab !== "requests") return;
    setMobileDetail(Boolean(selectedId));
  }, [selectedId, tab]);

  const review = async (status: "approved" | "rejected" | "pending") => {
    if (!canVerify || !selected) return;
    if ((status === "rejected" || status === "pending") && !applicantNote.trim()) {
      setError(
        status === "rejected"
          ? "Applicant-facing reason is required to reject."
          : "Applicant-facing feedback is required when requesting changes.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(`/api/admin/verifications/${selected.id}`, {
        status,
        review_note: applicantNote.trim(),
        internal_note: internalNote.trim(),
        expected_updated_at: selected.updated_at,
      });
      setNotice(
        status === "approved"
          ? "Identity verification approved (users.verified). Org/gym scopes unchanged."
          : status === "rejected"
            ? "Request rejected."
            : "Additional information requested. Status remains pending.",
      );
      await Promise.all([loadQueue(), loadDetail()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setSaving(false);
    }
  };

  const claim = async () => {
    if (!canVerify || !selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(`/api/admin/verifications/${selected.id}`, {
        action: "claim",
        expected_updated_at: selected.updated_at,
      });
      setNotice("Review claimed.");
      await Promise.all([loadQueue(), loadDetail()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setSaving(false);
    }
  };

  const docs = selected?.identity_verification_documents ?? [];
  const uploadedKinds = useMemo(() => new Set(docs.map((doc) => doc.kind)), [docs]);
  const requirements = selected?.role_requirements ?? [];
  const missingRequired = selected?.missing_required?.length
    ? selected.missing_required
    : requirements.filter((item) => item.is_required && !uploadedKinds.has(item.slug));

  const oldestPendingLabel = counts.oldest_pending_at
    ? requestAgeLabel(counts.oldest_pending_at)
    : "-";

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Verification Center"
        description="Identity and role-document review. Org and gym verification stay in their own directories."
        actions={
          <div className="flex flex-wrap gap-1.5">
            {tab === "requests" ? (
              <AdminReloadButton
                loading={loading}
                refreshing={refreshing}
                onClick={() => void loadQueue()}
              />
            ) : null}
            <button
              type="button"
              onClick={() => writeParams({ tab: "requests", id: selectedId || null })}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-medium",
                tab === "requests"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-text-secondary hover:text-foreground",
              )}
            >
              Requests
            </button>
            {canReadDocs ? (
              <button
                type="button"
                onClick={() => writeParams({ tab: "requirements", id: null })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium",
                  tab === "requirements"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-text-secondary hover:text-foreground",
                )}
              >
                Requirements
              </button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <div className="space-y-2">
          <AdminErrorAlert message={error} />
          {loadState === "failed" || loadState === "denied" ? (
            <button
              type="button"
              onClick={() => void loadQueue()}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      {tab === "requirements" ? (
        <VerificationRequirementsEditor embedded />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span>
              Queue counts ({countsScope}): pending {counts.pending ?? 0} · in review{" "}
              {counts.in_review ?? 0} · needs info {counts.needs_info ?? 0} · approved{" "}
              {counts.approved ?? 0} · rejected {counts.rejected ?? 0}
            </span>
            <span className="text-text-hint">· Oldest pending: {oldestPendingLabel}</span>
            <span className="text-text-hint">
              · Other scopes:{" "}
              <Link href="/admin/organizations" className="text-primary hover:underline">
                Organizations
              </Link>
              {" · "}
              <Link href="/admin/gyms" className="text-primary hover:underline">
                Gyms
              </Link>
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUEUE_FILTERS.map((f) => {
              const countKey = f.id as keyof QueueCounts;
              const n =
                f.id === "all"
                  ? counts.total
                  : typeof counts[countKey] === "number"
                    ? counts[countKey]
                    : undefined;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => writeParams({ status: f.id, id: null, page: "1" })}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-xs font-medium",
                    statusFilter === f.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-text-secondary hover:text-foreground",
                  )}
                >
                  {f.label}
                  {typeof n === "number" ? ` (${n})` : ""}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="grid gap-1 text-xs">
              <span className="text-text-secondary">Role / entity</span>
              <select
                value={roleFilter}
                onChange={(e) => writeParams({ role: e.target.value === "all" ? null : e.target.value, page: "1" })}
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
              >
                <option value="all">All roles</option>
                <option value="athlete">Athlete</option>
                <option value="professional">Professional</option>
              </select>
            </label>
          </div>

          <div
            className={cn(
              "grid min-h-[70vh] gap-4",
              mobileDetail && selectedId ? "lg:grid-cols-[minmax(280px,360px)_1fr]" : "lg:grid-cols-[minmax(280px,360px)_1fr]",
            )}
          >
            <section
              className={cn(
                "flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
                mobileDetail && selectedId ? "hidden lg:flex" : "flex",
              )}
            >
              <div className="border-b border-border p-3">
                <AdminSearchInput
                  value={query}
                  onChange={(value) => {
                    setQuery(value);
                    writeParams({ q: value || null, page: "1" });
                  }}
                  placeholder="Search applicants…"
                />
                <p className="mt-2 text-[11px] text-text-hint">
                  Showing {rows.length} of {total} · server-side search · identity scope only
                </p>
              </div>
              {loading ? <AdminLoadingRow label="Loading queue…" compact className="py-10" /> : null}
              {!loading && loadState === "failed" ? (
                <AdminEmpty title="Could not load queue" description="Use Retry above after fixing the API error." />
              ) : null}
              {!loading && loadState === "denied" ? (
                <AdminEmpty title="Permission denied" description="You need users:read or users:verify." />
              ) : null}
              {!loading && loadState === "empty" ? (
                <AdminEmpty
                  title={query.trim() ? "No matching requests" : "Empty queue"}
                  description={
                    query.trim()
                      ? "No requests match this search and filter."
                      : "No submitted identity requests here. Unverified people still show under People → Pending verifications."
                  }
                />
              ) : null}
              {!loading && loadState === "ok" ? (
                <ul className="flex-1 overflow-y-auto divide-y divide-border">
                  {rows.map((row) => {
                    const person = row.users;
                    const active = selectedId === row.id;
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => writeParams({ id: row.id })}
                          className={cn(
                            "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40",
                            active && "bg-secondary/70",
                          )}
                        >
                          <UserAvatar
                            name={person?.display_name || person?.full_name}
                            src={person?.avatar_url}
                            size={36}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {person?.display_name || person?.full_name || "Unknown"}
                            </p>
                            <p className="truncate text-[11px] text-text-secondary">
                              {person?.role || "-"} · identity · {formatDate(row.created_at)}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <StatusBadge tone={requestTone(row.status)}>
                                {verificationStatusLabel(row.queue_facet || row.status)}
                              </StatusBadge>
                              <span className="text-[10px] text-text-hint">
                                {requestAgeLabel(row.created_at)}
                              </span>
                              {row.missing_docs ? (
                                <span className="text-[10px] font-medium text-amber-800">
                                  Missing docs
                                </span>
                              ) : null}
                              {row.reviewer?.display_name ? (
                                <span className="text-[10px] text-text-hint">
                                  · {row.reviewer.display_name}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {!loading && total > 40 ? (
                <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => writeParams({ page: String(page - 1) })}
                    className="rounded border border-border px-2 py-1 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span>
                    Page {page}
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
            </section>

            <section
              className={cn(
                "overflow-hidden rounded-xl border border-border bg-card shadow-sm",
                !selectedId ? "hidden lg:block" : "block",
                mobileDetail && selectedId ? "block" : "",
              )}
            >
              {selectedId ? (
                <div className="border-b border-border px-3 py-2 lg:hidden">
                  <button
                    type="button"
                    onClick={() => writeParams({ id: null })}
                    className="text-xs font-medium text-primary"
                  >
                    ← Back to queue
                  </button>
                </div>
              ) : null}
              {detailLoading ? <AdminLoadingRow label="Loading request…" fill /> : null}
              {!detailLoading && !selected ? (
                <div className="grid h-full place-items-center p-8 text-sm text-text-hint">
                  Select a request from the queue
                </div>
              ) : null}
              {!detailLoading && selected ? (
                <div className="max-h-[78vh] overflow-y-auto p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      {selected.users ? (
                        <Link
                          href={`/admin/people/${selected.users.id}`}
                          className="font-heading text-base font-semibold text-primary hover:underline"
                        >
                          {selected.users.display_name || selected.users.full_name}
                        </Link>
                      ) : (
                        <p className="font-heading text-base font-semibold">Unknown user</p>
                      )}
                      <p className="mt-1 text-xs text-text-secondary">
                        Role: {selected.users?.role || "-"} · Scope: identity / role credentials ·
                        submitted {formatDateTime(selected.created_at)}
                      </p>
                      {selected.reviewer_id ? (
                        <p className="mt-1 text-xs text-text-hint">
                          Assigned reviewer: {selected.reviewer?.display_name || selected.reviewer_id}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge tone={requestTone(selected.status)}>
                      {verificationStatusLabel(selected.status)}
                    </StatusBadge>
                  </div>

                  {canVerify && selected.status === "pending" ? (
                    <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                      {!selected.reviewer_id ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void claim()}
                          className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                        >
                          Start / claim review
                        </button>
                      ) : null}
                      <label className="grid gap-1 text-sm">
                        <span className="text-text-secondary">Applicant-facing feedback</span>
                        <textarea
                          value={applicantNote}
                          onChange={(e) => setApplicantNote(e.target.value)}
                          rows={2}
                          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                          placeholder="Shown to the applicant on rejection or request for changes"
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="text-text-secondary">Internal notes (staff only)</span>
                        <textarea
                          value={internalNote}
                          onChange={(e) => setInternalNote(e.target.value)}
                          rows={2}
                          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                          placeholder="Not shown to the applicant"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saving || !applicantNote.trim()}
                          onClick={() => void review("pending")}
                          className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                        >
                          Request replacement / more info
                        </button>
                        <button
                          type="button"
                          disabled={saving || !applicantNote.trim()}
                          onClick={() => void review("rejected")}
                          className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void review("approved")}
                          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                        >
                          Approve identity
                        </button>
                      </div>
                      <p className="text-[11px] text-text-hint">
                        Approval sets users.verified only. It does not verify organizations or gyms.
                        Concurrent reviewers and stale pages are blocked via version checks.
                      </p>
                    </div>
                  ) : null}

                  {selected.applicant_feedback || selected.review_note ? (
                    <p className="mb-3 text-sm text-text-secondary">
                      Applicant feedback: {selected.applicant_feedback || selected.review_note}
                      {selected.reviewed_at ? ` · ${formatDate(selected.reviewed_at)}` : ""}
                    </p>
                  ) : null}
                  {selected.internal_notes || selected.notes ? (
                    <p className="mb-4 text-sm text-text-hint">
                      Internal: {selected.internal_notes || selected.notes}
                    </p>
                  ) : null}

                  {requirements.length > 0 ? (
                    <div className="mb-4">
                      <h3 className="mb-2 text-sm font-semibold">
                        Checklist
                        {selected.requirements_source === "fallback" ? (
                          <span className="ml-2 text-xs font-normal text-amber-800">
                            (fallback - not live catalog)
                          </span>
                        ) : null}
                      </h3>
                      {missingRequired.length > 0 ? (
                        <p className="mb-2 text-xs text-amber-800">
                          Missing required:{" "}
                          {missingRequired.map((item) => item.label || item.slug).join(", ")}
                        </p>
                      ) : (
                        <p className="mb-2 text-xs text-emerald-800">
                          All required types uploaded under applicable policy.
                        </p>
                      )}
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {requirements.map((item) => {
                          const uploaded = uploadedKinds.has(item.slug);
                          return (
                            <li
                              key={item.slug}
                              className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                            >
                              <div>
                                <p className="font-medium">
                                  {item.label}
                                  {item.is_required ? " *" : ""}
                                </p>
                                <p className="text-text-hint">{verificationStepLabel(item.step)}</p>
                              </div>
                              <StatusBadge
                                tone={uploaded ? "success" : item.is_required ? "warning" : "neutral"}
                              >
                                {uploaded ? "OK" : item.is_required ? "Missing" : "Optional"}
                              </StatusBadge>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    <p className="mb-4 text-xs text-text-hint">
                      No role document requirements configured for this applicant’s role.
                    </p>
                  )}

                  <h3 className="mb-2 text-sm font-semibold">Submitted documents</h3>
                  {docs.length === 0 ? (
                    <p className="mb-4 text-sm text-text-hint">No documents on this request.</p>
                  ) : (
                    <div className="mb-4 grid gap-3 md:grid-cols-2">
                      {docs.map((doc) => {
                        const state = docReviewState(
                          selected.status,
                          Boolean(String(selected.review_note || "").trim() && selected.status === "pending"),
                        );
                        return (
                          <figure
                            key={doc.id}
                            className="overflow-hidden rounded-lg border border-border bg-muted/20"
                          >
                            <figcaption className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-xs font-medium">
                              <span>{verificationDocLabel(doc.kind, doc.label)}</span>
                              <StatusBadge
                                tone={
                                  state === "accepted"
                                    ? "success"
                                    : state === "rejected"
                                      ? "danger"
                                      : state === "needs_replacement"
                                        ? "warning"
                                        : "neutral"
                                }
                              >
                                {state.replace(/_/g, " ")}
                              </StatusBadge>
                            </figcaption>
                            {doc.mime_type?.startsWith("image/") && doc.signed_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={doc.signed_url}
                                alt={verificationDocLabel(doc.kind, doc.label)}
                                className="h-56 w-full object-contain bg-muted"
                              />
                            ) : doc.signed_url ? (
                              <a
                                href={doc.signed_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block px-3 py-6 text-center text-sm text-primary hover:underline"
                              >
                                Open document (short-lived URL)
                              </a>
                            ) : (
                              <p className="px-3 py-6 text-center text-xs text-text-hint">
                                Preview unavailable
                              </p>
                            )}
                          </figure>
                        );
                      })}
                    </div>
                  )}

                  {selected.timeline && selected.timeline.length > 0 ? (
                    <div className="mb-4">
                      <h3 className="mb-2 text-sm font-semibold">Review timeline</h3>
                      <ul className="space-y-1 text-xs text-text-secondary">
                        {selected.timeline.map((event, index) => (
                          <li key={`${event.action}-${index}`}>
                            {event.at ? formatDateTime(event.at) : "-"} · {event.label || event.action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {selected.prior_submissions && selected.prior_submissions.length > 0 ? (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Prior submissions</h3>
                      <ul className="space-y-1 text-xs text-text-secondary">
                        {selected.prior_submissions.map((prior) => (
                          <li key={prior.id}>
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => writeParams({ id: prior.id })}
                            >
                              {formatDate(prior.created_at)} · {verificationStatusLabel(prior.status)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
