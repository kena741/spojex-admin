"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { ActivityLogDetails } from "@/components/ActivityLogDetails";
import { hasActivityDetails } from "@/lib/activity-log-changes";
import type { AdminActivityLog } from "@/lib/activity-log";
import {
  AUDIT_ACTION_REGISTRY,
  AUDIT_OUTCOMES,
  AUDIT_RESOURCE_REGISTRY,
} from "@/lib/audit-event-registry";
import { adminFetch } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { StatusBadge } from "@/components/status-badge";

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

  const [logs, setLogs] = useState<AdminActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (permsLoading) return;
    if (!canRead) {
      setLoading(false);
      setError("You need logs:read permission to view activity logs.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
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
      setLogs(payload.data ?? []);
      setTotal(payload.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity logs");
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, canRead, currentPage, outcomeFilter, permsLoading, resourceFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setCurrentPage(1);
  }, [actionFilter, resourceFilter, outcomeFilter, query]);

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
      <div>
        <AdminPageHeader title="Activity Logs" description="Track actions performed by admin users" />
        <AdminLoadingRow label="Checking permissions…" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div>
        <AdminPageHeader title="Activity Logs" description="Track actions performed by admin users" />
        <AdminErrorAlert message="You need logs:read permission to view activity logs." />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Activity Logs"
        description="Append-only audit of privileged admin actions. Times shown in your browser local timezone."
        actions={
          <div className="flex gap-2">
            {canExport ? (
              <a
                href={`/api/admin/activity-logs/export?${new URLSearchParams({
                  ...(actionFilter ? { action: actionFilter } : {}),
                  ...(resourceFilter ? { resource_type: resourceFilter } : {}),
                  ...(outcomeFilter ? { outcome: outcomeFilter } : {}),
                }).toString()}`}
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted"
              >
                Export
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        }
      />

      <AdminFilterPanel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
        <p className="mt-2 text-[11px] text-text-hint">
          Filters use the canonical audit registry. Historical rows with other action names remain
          searchable via the text box on the current page.
        </p>
      </AdminFilterPanel>

      {loading ? <AdminLoadingRow label="Loading activity logs…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      <AdminTableShell>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
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
              {filtered.map((log, idx) => {
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
                    <tr className="border-b border-border/70 align-top">
                      <td className="px-4 py-3 text-muted-foreground">
                        {(currentPage - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-primary">
                            {log.admin_name || "Unknown"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {log.admin_email || "-"}
                          </span>
                          {log.admin_role ? (
                            <span className="mt-1 inline-flex w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
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
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {log.resource_type}
                          </span>
                          {log.resource_name ? (
                            <span className="text-muted-foreground">{log.resource_name}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={outcomeTone(typeof outcome === "string" ? outcome : null)}>
                          {typeof outcome === "string" && outcome ? outcome : "Not recorded"}
                        </StatusBadge>
                      </td>
                      <td className="max-w-md px-4 py-3 text-muted-foreground">
                        {log.display_summary || log.summary}
                      </td>
                      <td className="px-4 py-3">
                        {canExpand ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLogId(isExpanded ? null : log.id)
                            }
                            className="inline-flex h-8 items-center rounded-lg border border-primary/30 bg-card px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
                          >
                            {isExpanded ? "Hide" : "View"}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="bg-muted/40">
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
              })}
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <Search className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="text-lg font-semibold text-foreground">
                        No activity logs found
                      </p>
                      <p className="text-sm">
                        Actions will appear here after admins make changes
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminTableShell>

      {total > 0 ? (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-card px-6 py-3 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Total <span className="font-semibold text-foreground">{total}</span>{" "}
            log entries
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[80px] text-center text-sm font-medium text-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
