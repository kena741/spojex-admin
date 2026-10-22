"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminReloadButton,
  AdminSearchInput,
  AdminSelect,
  AdminTableLoading,
  AdminTableShell,
} from "@/components/admin-layout";
import { ActivityLogDetails } from "@/components/ActivityLogDetails";
import { StatusBadge } from "@/components/status-badge";
import { hasActivityDetails } from "@/lib/activity-log-changes";
import type { AdminActivityLog } from "@/lib/activity-log";
import {
  AUDIT_ACTION_REGISTRY,
  AUDIT_OUTCOMES,
  AUDIT_RESOURCE_REGISTRY,
} from "@/lib/audit-event-registry";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { adminFetch } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useAdminUiState } from "@/lib/use-admin-ui-state";
import { useAdminPermissions } from "@/lib/use-admin-permissions";

const PAGE_SIZE = 30;

const ACTION_OPTIONS = [...AUDIT_ACTION_REGISTRY];
const RESOURCE_OPTIONS = [...AUDIT_RESOURCE_REGISTRY];

function outcomeTone(outcome?: string | null): "success" | "warning" | "danger" | "neutral" {
  if (outcome === "success") return "success";
  if (outcome === "denied") return "warning";
  if (outcome === "error") return "danger";
  return "neutral";
}

export default function ActivityLogsPage() {
  const { can, loading: permsLoading } = useAdminPermissions();
  const canRead = can("logs:read");
  const canExport = can("logs:export");

  const [query, setQuery] = useAdminUiState("activity-logs:query", "");
  const [actionFilter, setActionFilter] = useAdminUiState("activity-logs:action", "");
  const [resourceFilter, setResourceFilter] = useAdminUiState("activity-logs:resource", "");
  const [outcomeFilter, setOutcomeFilter] = useAdminUiState("activity-logs:outcome", "");
  const [currentPage, setCurrentPage] = useAdminUiState("activity-logs:page", 1);
  const [expandedLogId, setExpandedLogId] = useAdminUiState<string | null>(
    "activity-logs:expanded",
    null,
  );

  const {
    data,
    loading,
    refreshing,
    error,
    refresh,
  } = useAdminQuery<{ logs: AdminActivityLog[]; total: number }>({
    key: adminCacheKey([
      "activity-logs",
      "list",
      currentPage,
      actionFilter,
      resourceFilter,
      outcomeFilter,
    ]),
    enabled: !permsLoading && canRead,
    fetcher: async () => {
      const offset = (currentPage - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (actionFilter) params.set("action", actionFilter);
      if (resourceFilter) params.set("resource_type", resourceFilter);
      if (outcomeFilter) params.set("outcome", outcomeFilter);

      const res = await adminFetch(`/api/admin/activity-logs?${params}`);
      const payload = (await res.json()) as {
        data?: AdminActivityLog[];
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Failed to load activity logs");
      return { logs: payload.data ?? [], total: payload.total ?? 0 };
    },
  });
  const logs = useMemo(() => data?.logs ?? [], [data]);
  const total = data?.total ?? 0;

  // Reset to page 1 when filters change (not on remount, so restored page survives).
  const filterSignature = `${actionFilter}|${resourceFilter}|${outcomeFilter}|${query}`;
  const lastFilterSignature = useRef(filterSignature);
  useEffect(() => {
    if (lastFilterSignature.current === filterSignature) return;
    lastFilterSignature.current = filterSignature;
    setCurrentPage(1);
  }, [filterSignature, setCurrentPage]);

  const filtered = useMemo(() => {
    if (!query.trim()) return logs;
    const q = query.toLowerCase();
    return logs.filter((log) => {
      return (
        (log.admin_name || "").toLowerCase().includes(q) ||
        (log.admin_email || "").toLowerCase().includes(q) ||
        (log.display_summary || log.summary || "").toLowerCase().includes(q) ||
        (log.resource_name || "").toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.resource_type.toLowerCase().includes(q) ||
        JSON.stringify(log.metadata || {}).toLowerCase().includes(q)
      );
    });
  }, [logs, query]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (permsLoading) {
    return (
      <>
        <AdminPageHeader
          title="Activity Logs"
          description="Track actions performed by admin users"
        />
        <AdminLoadingRow label="Checking permissions…" />
      </>
    );
  }

  if (!canRead) {
    return (
      <>
        <AdminPageHeader
          title="Activity Logs"
          description="Track actions performed by admin users"
        />
        <AdminErrorAlert message="You need logs:read permission to view activity logs." />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Activity Logs"
        description={`${total} entries · times shown in your browser local timezone`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => void refresh()}
            />
            {canExport ? (
              <a
                href={`/api/admin/activity-logs/export?${new URLSearchParams({
                  ...(actionFilter ? { action: actionFilter } : {}),
                  ...(resourceFilter ? { resource_type: resourceFilter } : {}),
                  ...(outcomeFilter ? { outcome: outcomeFilter } : {}),
                }).toString()}`}
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-medium text-text-secondary hover:text-foreground"
              >
                Export
              </a>
            ) : null}
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <AdminFilterPanel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search admin, summary, resource…"
          />
          <AdminSelect value={actionFilter} onChange={setActionFilter}>
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={resourceFilter} onChange={setResourceFilter}>
            <option value="">All resources</option>
            {RESOURCE_OPTIONS.map((resource) => (
              <option key={resource} value={resource}>
                {resource}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={outcomeFilter} onChange={setOutcomeFilter}>
            <option value="">All outcomes</option>
            {AUDIT_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {outcome}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>

      <AdminTableShell>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
              <tr>
                <th className="w-[60px] px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Admin</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Resource</th>
                <th className="px-4 py-3 font-semibold">Outcome</th>
                <th className="px-4 py-3 font-semibold">Summary</th>
                <th className="w-[120px] px-4 py-3 font-semibold">Details</th>
                <th className="px-4 py-3 font-semibold">When (local)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <AdminTableLoading colSpan={8} label="Loading activity logs…" />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-0">
                    <AdminEmpty
                      title="No activity logs found"
                      description="Privileged admin actions appear here after changes are made. Adjust filters and Reload."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((log, idx) => {
                  const isExpanded = expandedLogId === log.id;
                  const canExpand =
                    hasActivityDetails(log.metadata) ||
                    Boolean(log.resource_id) ||
                    Boolean(log.route);
                  const outcome =
                    log.outcome ||
                    (typeof log.metadata?.outcome === "string" ? log.metadata.outcome : null);

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="border-b border-border last:border-0 hover:bg-muted/40 align-top">
                        <td className="px-4 py-3 text-text-secondary">
                          {(currentPage - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 flex-col">
                            <span className="font-medium text-text-primary">
                              {log.admin_name || "Unknown"}
                            </span>
                            <span className="text-xs text-text-secondary">
                              {log.admin_email || "-"}
                            </span>
                            {log.admin_role ? (
                              <span className="mt-1 inline-flex w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                                {log.admin_role}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 flex-col">
                            <span className="font-medium text-text-primary">
                              {log.resource_type}
                            </span>
                            {log.resource_name ? (
                              <span className="truncate text-xs text-text-secondary">
                                {log.resource_name}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            tone={outcomeTone(typeof outcome === "string" ? outcome : null)}
                          >
                            {typeof outcome === "string" && outcome
                              ? outcome
                              : "Not recorded"}
                          </StatusBadge>
                        </td>
                        <td className="max-w-md px-4 py-3 text-text-secondary">
                          {log.display_summary || log.summary}
                        </td>
                        <td className="px-4 py-3">
                          {canExpand ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLogId(isExpanded ? null : log.id)
                              }
                              className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-text-secondary hover:text-foreground"
                            >
                              {isExpanded ? "Hide" : "View"}
                            </button>
                          ) : (
                            <span className="text-xs text-text-hint">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-b border-border bg-muted/30">
                          <td colSpan={8} className="px-4 py-4">
                            <ActivityLogDetails
                              metadata={log.metadata}
                              resourceId={log.resource_id}
                              route={log.route}
                              env={log.env}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </AdminTableShell>

      {total > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm sm:px-6">
          <p className="text-sm text-text-secondary">
            Total <span className="font-semibold text-text-primary">{total}</span> log
            entries
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-text-secondary transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[80px] text-center text-sm font-medium text-text-primary">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages || loading}
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-text-secondary transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
