"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminSearchInput,
  AdminTableShell,
} from "@/components/admin-layout";
import { UserAvatar } from "@/components/user-avatar";
import { deleteAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { ReportRow } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

function userLabel(
  user?: { display_name?: string | null; username?: string | null } | null,
  fallbackId?: string | null,
) {
  return user?.display_name || user?.username || (fallbackId ? fallbackId.slice(0, 8) : "Unknown");
}

function reportTargetLabel(row: ReportRow) {
  if (row.target_service_id) {
    return row.service?.title || `Service ${row.target_service_id.slice(0, 8)}`;
  }
  if (row.target_user_id) {
    return userLabel(row.target, row.target_user_id);
  }
  return "—";
}

function reportType(row: ReportRow) {
  if (row.target_service_id) return "Service";
  if (row.target_user_id) return "User";
  return "Other";
}

function previewText(value: string, max = 80) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

export default function ReportsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("reports:write");

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/admin/reports", { credentials: "same-origin" });
    const payload = (await response.json()) as { data?: ReportRow[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Failed to load reports");
    setRows(payload.data ?? []);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const hay = [
        row.reason,
        row.details,
        reportType(row),
        userLabel(row.reporter, row.reporter_id),
        reportTargetLabel(row),
        row.reporter_id,
        row.target_user_id ?? "",
        row.target_service_id ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, query]);

  const dismiss = async (id: string) => {
    if (!canWrite) return;
    try {
      await deleteAdmin(`/api/admin/reports/${id}`);
      if (expandedId === id) setExpandedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const colSpan = canWrite ? 7 : 6;

  return (
    <>
      <AdminPageHeader
        title="Reports"
        description="User-submitted profile and service reports. Radio chat reports live under Radio chat."
      />
      {loading ? <AdminLoadingRow label="Loading reports…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      <AdminFilterPanel>
        <AdminSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search reason, message, reporter, target…"
        />
      </AdminFilterPanel>

      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title={rows.length === 0 ? "No reports visible" : "No matching reports"}
            description={
              rows.length === 0
                ? "Reports require an authenticated admin session against the Spojex API."
                : "Try a different search."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 font-semibold">Message</th>
                  <th className="px-4 py-3 font-semibold">Reporter</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold" /> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const open = expandedId === row.id;
                  const message = row.details?.trim() || "";
                  return (
                    <Fragment key={row.id}>
                      <tr className="border-b border-border last:border-0 align-top hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setExpandedId(open ? null : row.id)}
                            className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-left font-medium hover:bg-muted"
                            aria-expanded={open}
                            aria-label={open ? "Hide report details" : "Show report details"}
                          >
                            {open ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" />
                            )}
                            {reportType(row)}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium">{row.reason || "—"}</td>
                        <td className="max-w-xs px-4 py-3 text-text-secondary">
                          {message ? (
                            <button
                              type="button"
                              onClick={() => setExpandedId(open ? null : row.id)}
                              className="text-left hover:text-text-primary"
                              title="View full message"
                            >
                              {previewText(message)}
                            </button>
                          ) : (
                            <span className="italic text-text-secondary/70">No message</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/users/${row.reporter_id}`}
                            className="flex min-w-0 items-center gap-2 text-primary"
                          >
                            <UserAvatar
                              name={userLabel(row.reporter, row.reporter_id)}
                              src={row.reporter?.avatar_url}
                              size={28}
                            />
                            <span className="min-w-0 truncate font-medium">
                              {userLabel(row.reporter, row.reporter_id)}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {row.target_service_id ? (
                            <Link
                              href={`/admin/services/${row.target_service_id}`}
                              className="font-medium text-primary"
                            >
                              {reportTargetLabel(row)}
                            </Link>
                          ) : row.target_user_id ? (
                            <Link
                              href={`/admin/users/${row.target_user_id}`}
                              className="flex min-w-0 items-center gap-2 text-primary"
                            >
                              <UserAvatar
                                name={userLabel(row.target, row.target_user_id)}
                                src={row.target?.avatar_url}
                                size={28}
                              />
                              <span className="min-w-0 truncate font-medium">
                                {userLabel(row.target, row.target_user_id)}
                              </span>
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                          {formatDateTime(row.created_at)}
                        </td>
                        {canWrite ? (
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => dismiss(row.id)}
                              className="text-sm text-red-600 hover:underline"
                            >
                              Dismiss
                            </button>
                          </td>
                        ) : null}
                      </tr>
                      {open ? (
                        <tr className="border-b border-border bg-muted/40 last:border-0">
                          <td colSpan={colSpan} className="px-4 py-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                                  Report message
                                </h3>
                                <p className="whitespace-pre-wrap rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-text-primary">
                                  {message || "No additional message was provided."}
                                </p>
                                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                                  <dt className="text-text-secondary">Reason</dt>
                                  <dd className="font-medium">{row.reason || "—"}</dd>
                                  <dt className="text-text-secondary">Type</dt>
                                  <dd>{reportType(row)}</dd>
                                  <dt className="text-text-secondary">Created</dt>
                                  <dd>{formatDateTime(row.created_at)}</dd>
                                  <dt className="text-text-secondary">Report ID</dt>
                                  <dd className="break-all font-mono text-xs">{row.id}</dd>
                                </dl>
                              </div>
                              <div className="space-y-3 text-sm">
                                <div>
                                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                                    Reporter
                                  </h3>
                                  <Link
                                    href={`/admin/users/${row.reporter_id}`}
                                    className="inline-flex items-center gap-2 text-primary"
                                  >
                                    <UserAvatar
                                      name={userLabel(row.reporter, row.reporter_id)}
                                      src={row.reporter?.avatar_url}
                                      size={32}
                                    />
                                    <span>
                                      <span className="block font-medium">
                                        {userLabel(row.reporter, row.reporter_id)}
                                      </span>
                                      <span className="block font-mono text-xs text-text-secondary">
                                        {row.reporter_id}
                                      </span>
                                    </span>
                                  </Link>
                                </div>
                                <div>
                                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                                    Reported {reportType(row).toLowerCase()}
                                  </h3>
                                  {row.target_service_id ? (
                                    <Link
                                      href={`/admin/services/${row.target_service_id}`}
                                      className="text-primary"
                                    >
                                      <span className="block font-medium">{reportTargetLabel(row)}</span>
                                      <span className="block font-mono text-xs text-text-secondary">
                                        {row.target_service_id}
                                      </span>
                                    </Link>
                                  ) : row.target_user_id ? (
                                    <Link
                                      href={`/admin/users/${row.target_user_id}`}
                                      className="inline-flex items-center gap-2 text-primary"
                                    >
                                      <UserAvatar
                                        name={userLabel(row.target, row.target_user_id)}
                                        src={row.target?.avatar_url}
                                        size={32}
                                      />
                                      <span>
                                        <span className="block font-medium">
                                          {userLabel(row.target, row.target_user_id)}
                                        </span>
                                        <span className="block font-mono text-xs text-text-secondary">
                                          {row.target_user_id}
                                        </span>
                                      </span>
                                    </Link>
                                  ) : (
                                    <p className="text-text-secondary">No target linked.</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
