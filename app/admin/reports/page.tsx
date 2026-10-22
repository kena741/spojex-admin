"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
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
import { UserAvatar } from "@/components/user-avatar";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn, formatDateTime } from "@/lib/utils";

type ReportItem = {
  id: string;
  reporter_id: string;
  reporter?: {
    id: string;
    display_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  } | null;
  target_type: string;
  target_id?: string | null;
  target_user_id?: string | null;
  target_service_id?: string | null;
  target?: {
    id: string;
    display_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  } | null;
  service?: { id: string; title?: string | null } | null;
  reason?: string | null;
  reason_code?: string | null;
  details?: string;
  status: string;
  assigned_admin_id?: string | null;
  related_report_count?: number;
  created_at?: string | null;
  target_removed?: boolean;
  content_surface?: string;
};

type ListPayload = {
  items?: ReportItem[];
  total?: number;
  page?: number;
  page_size?: number;
  has_more?: boolean;
  unresolved_count?: number | null;
  note?: string;
  error?: string;
  code?: string;
};

type DetailPayload = ReportItem & {
  evidence?: Record<string, unknown>;
  message_context?: {
    message?: { body?: string; conversation_id?: string; sender_id?: string | null };
    neighbors?: { id: string; body?: string; is_reported?: boolean }[];
    note?: string;
  } | null;
  news?: { id: string; title?: string; href?: string; status?: string } | null;
  activity?: { id: string; action: string; summary?: string; created_at?: string | null }[];
  allowed_actions?: string[];
  resolution_note?: string;
  updated_at?: string | null;
  error?: string;
};

function userLabel(
  user?: { display_name?: string | null; username?: string | null } | null,
  fallbackId?: string | null,
) {
  return user?.display_name || user?.username || (fallbackId ? fallbackId.slice(0, 8) : "Unknown");
}

function targetLabel(row: ReportItem) {
  if (row.service?.title) return row.service.title;
  if (row.target) return userLabel(row.target, row.target_user_id);
  if (row.target_id) return `${row.target_type} · ${row.target_id.slice(0, 8)}`;
  return "—";
}

function statusTone(status: string) {
  if (status === "open") return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  if (status === "in_review") return "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200";
  if (status === "resolved") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
  if (status === "dismissed") return "bg-muted text-text-secondary";
  return "bg-muted text-text-secondary";
}

function ReportsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = can("reports:write");

  const status = searchParams.get("status") || "unresolved";
  const targetType = searchParams.get("target_type") || "all";
  const q = searchParams.get("q") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const selectedId = searchParams.get("id") || "";

  const [payload, setPayload] = useState<ListPayload | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);
  const [busy, setBusy] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const writeParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const qs = new URLSearchParams();
      qs.set("status", status);
      if (targetType !== "all") qs.set("target_type", targetType);
      if (q) qs.set("q", q);
      qs.set("page", String(page));
      qs.set("page_size", "40");
      const res = await fetch(`/api/admin/reports?${qs}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await res.json()) as ListPayload;
      if (!res.ok) {
        setError(body.error || "Couldn't load reports.");
        setErrorCode(body.code || String(res.status));
        setPayload(null);
        return;
      }
      setPayload(body);
    } catch {
      setError("Couldn't load reports.");
      setErrorCode("network_error");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [status, targetType, q, page]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/reports/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await res.json()) as DetailPayload;
      if (!res.ok) {
        setActionError(body.error || "Couldn't load case.");
        setDetail(null);
        return;
      }
      setDetail(body);
    } catch {
      setActionError("Couldn't load case.");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const rows = payload?.items ?? [];
  const emptyGenuine = !loading && !error && rows.length === 0 && !q;
  const emptyFiltered = !loading && !error && rows.length === 0 && Boolean(q || (status !== "unresolved") || targetType !== "all");

  const runClaim = async () => {
    if (!selectedId || !canWrite) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/reports/${encodeURIComponent(selectedId)}/claim`, {
        method: "POST",
        credentials: "same-origin",
      });
      const body = (await res.json()) as { error?: string; report?: DetailPayload };
      if (!res.ok) throw new Error(body.error || "Claim failed");
      if (body.report) setDetail(body.report);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  };

  const runDecision = async (action: string) => {
    if (!selectedId || !canWrite) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/reports/${encodeURIComponent(selectedId)}/decisions`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: decisionNote || null,
          expected_updated_at: detail?.updated_at || null,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        ok?: boolean;
        enforcement?: { applied?: boolean; error?: string | null };
        report?: DetailPayload;
      };
      if (!res.ok && !body.report) throw new Error(body.error || "Decision failed");
      if (body.enforcement && body.enforcement.applied === false && body.enforcement.error) {
        setActionError(`Decision recorded issue: ${body.enforcement.error}`);
      }
      if (body.report) setDetail(body.report);
      setDecisionNote("");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Reports"
        description="Moderation queue for profile, service, message, organization, and content reports. Radio chat has its own queue."
        breadcrumbs={[
          { label: "Network", href: "/admin/network" },
          { label: "Reports" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            {payload?.unresolved_count != null ? (
              <span className="text-xs text-text-hint">
                {payload.unresolved_count} unresolved
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium"
            >
              Refresh
            </button>
            <Link
              href="/admin/radio-chat?tab=reports"
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium"
            >
              Radio chat reports
            </Link>
          </div>
        }
      />

      {loading ? <AdminLoadingRow label="Loading reports…" /> : null}

      {error ? (
        <div className="space-y-2">
          <AdminErrorAlert message={error} />
          {(errorCode === "unauthorized" || errorCode === "401") && (
            <Link href="/login" className="text-sm font-medium text-primary hover:underline">
              Sign in again
            </Link>
          )}
          {(errorCode === "network_error" || errorCode === "upstream_error" || errorCode === "502") && (
            <button
              type="button"
              onClick={() => void load()}
              className="text-sm font-medium text-primary hover:underline"
            >
              Retry
            </button>
          )}
        </div>
      ) : null}

      <AdminFilterPanel>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-text-hint">Status</label>
            <AdminSelect
              value={status}
              onChange={(v) => writeParams({ status: v, page: null })}
            >
              <option value="unresolved">Unresolved</option>
              <option value="open">New</option>
              <option value="in_review">In review</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All</option>
            </AdminSelect>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-text-hint">Target type</label>
            <AdminSelect
              value={targetType}
              onChange={(v) => writeParams({ target_type: v === "all" ? null : v, page: null })}
            >
              <option value="all">All types</option>
              <option value="user">User</option>
              <option value="service">Service</option>
              <option value="message">Message</option>
              <option value="organization">Organization</option>
              <option value="news">News / video</option>
              <option value="conversation">Conversation</option>
            </AdminSelect>
          </div>
          <div className="flex min-w-[220px] flex-1 flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-[11px] text-text-hint">Search</label>
              <AdminSearchInput
                value={searchDraft}
                onChange={setSearchDraft}
                placeholder="Reason, reporter, target, report id…"
              />
            </div>
            <button
              type="button"
              onClick={() => writeParams({ q: searchDraft.trim() || null, page: null })}
              className="h-10 rounded-lg border border-border bg-card px-3 text-xs font-medium"
            >
              Search
            </button>
          </div>
        </div>
      </AdminFilterPanel>

      {payload?.note ? <p className="text-xs text-text-hint">{payload.note}</p> : null}

      <div className={cn("grid gap-4", selectedId ? "lg:grid-cols-[1fr_380px]" : "")}>
        <AdminTableShell>
          {emptyGenuine ? (
            <AdminEmpty
              title="No reports yet."
              description="Reports submitted from the app will appear here."
            />
          ) : null}
          {emptyFiltered ? (
            <AdminEmpty
              title="No reports match these filters."
              description="Try a different status, type, or search."
            />
          ) : null}
          {!loading && !error && rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 font-semibold">Target</th>
                    <th className="px-4 py-3 font-semibold">Reporter</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Related</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const selected = selectedId === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "cursor-pointer border-b border-border last:border-0 align-top hover:bg-muted/30",
                          selected && "bg-muted/40",
                        )}
                        onClick={() =>
                          writeParams({ id: selected ? null : row.id })
                        }
                      >
                        <td className="px-4 py-3 font-medium capitalize">{row.target_type}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.reason || row.reason_code || "—"}</div>
                          {row.details ? (
                            <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
                              {row.details}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{targetLabel(row)}</span>
                          {row.target_removed ? (
                            <p className="text-[11px] text-amber-700">Target removed</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <UserAvatar
                              name={userLabel(row.reporter, row.reporter_id)}
                              src={row.reporter?.avatar_url}
                              size={28}
                            />
                            <span className="truncate text-sm">
                              {userLabel(row.reporter, row.reporter_id)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize",
                              statusTone(row.status),
                            )}
                          >
                            {row.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-text-secondary">
                          {row.related_report_count ?? 1}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                          {row.created_at ? formatDateTime(row.created_at) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {(payload?.total ?? 0) > (payload?.page_size ?? 40) ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs">
              <span className="text-text-secondary">
                Page {payload?.page} · {payload?.total} reports
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => writeParams({ page: String(page - 1) })}
                  className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!payload?.has_more}
                  onClick={() => writeParams({ page: String(page + 1) })}
                  className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </AdminTableShell>

        {selectedId ? (
          <aside className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-heading text-base font-semibold">Case detail</h3>
                <p className="font-mono text-[11px] text-text-hint">{selectedId}</p>
              </div>
              <button
                type="button"
                className="text-xs text-text-secondary hover:underline"
                onClick={() => writeParams({ id: null })}
              >
                Close
              </button>
            </div>
            {detailLoading ? <AdminLoadingRow label="Loading case…" /> : null}
            {actionError ? <AdminErrorAlert message={actionError} /> : null}
            {detail ? (
              <div className="space-y-3 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-text-secondary">Type</dt>
                  <dd className="capitalize">{detail.target_type}</dd>
                  <dt className="text-text-secondary">Reason</dt>
                  <dd>{detail.reason || detail.reason_code || "—"}</dd>
                  <dt className="text-text-secondary">Status</dt>
                  <dd className="capitalize">{detail.status?.replace(/_/g, " ")}</dd>
                  <dt className="text-text-secondary">Target</dt>
                  <dd>{targetLabel(detail)}</dd>
                </dl>
                <div>
                  <h4 className="text-xs font-semibold uppercase text-text-secondary">Details</h4>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                    {detail.details?.trim() || "No additional details."}
                  </p>
                </div>
                {detail.message_context?.message ? (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-text-secondary">
                      Message evidence
                    </h4>
                    <p className="mt-1 text-xs">{detail.message_context.message.body}</p>
                    <p className="mt-1 text-[11px] text-text-hint">
                      {detail.message_context.note}
                    </p>
                  </div>
                ) : null}
                {detail.news ? (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-text-secondary">Content</h4>
                    <Link href={detail.news.href || "#"} className="text-xs text-primary hover:underline">
                      {detail.news.title || detail.news.id}
                    </Link>
                  </div>
                ) : null}
                {detail.reporter ? (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-text-secondary">Reporter</h4>
                    <Link
                      href={`/admin/users/${detail.reporter_id}`}
                      className="mt-1 inline-flex items-center gap-2 text-xs text-primary"
                    >
                      <UserAvatar
                        name={userLabel(detail.reporter, detail.reporter_id)}
                        src={detail.reporter.avatar_url}
                        size={24}
                      />
                      {userLabel(detail.reporter, detail.reporter_id)}
                    </Link>
                    <p className="mt-1 text-[11px] text-text-hint">
                      Reporter identity is admin-only — not shown to the reported user.
                    </p>
                  </div>
                ) : null}
                {(detail.activity?.length ?? 0) > 0 ? (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-text-secondary">Activity</h4>
                    <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-[11px] text-text-secondary">
                      {detail.activity!.map((a) => (
                        <li key={a.id}>
                          {a.action}: {a.summary}{" "}
                          {a.created_at ? `· ${formatDateTime(a.created_at)}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {canWrite ? (
                  <div className="space-y-2 border-t border-border pt-3">
                    <button
                      type="button"
                      disabled={busy || detail.status === "resolved" || detail.status === "dismissed"}
                      onClick={() => void runClaim()}
                      className="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-40"
                    >
                      Claim / take in review
                    </button>
                    <textarea
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                      placeholder="Decision / enforcement reason"
                      className="min-h-[64px] w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      {[
                        ["no_violation", "No violation"],
                        ["dismiss", "Dismiss"],
                        ["hide_content", "Hide content"],
                        ["restore_content", "Restore"],
                        ["resolve_only", "Resolve"],
                      ].map(([action, label]) => (
                        <button
                          key={action}
                          type="button"
                          disabled={busy}
                          onClick={() => void runDecision(action)}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-40"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-text-hint">
                      Hide/restore require a reason. Failed enforcement is not shown as success.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<AdminLoadingRow label="Loading reports…" />}>
      <ReportsPageInner />
    </Suspense>
  );
}
