"use client";

import { useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminReloadButton,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { ReasonModal, SmTabs, buttonClass, smGet, smPost } from "@/components/sports-market/shared";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { labelize, moderationTone, shortDate, type SmReport } from "@/lib/sports-market";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";

type Action = "dismiss" | "remove";

const STATUS_TONE: Record<SmReport["status"], "warning" | "neutral" | "danger"> = {
  open: "warning",
  dismissed: "neutral",
  actioned: "danger",
};

const STATUS_LABEL: Record<SmReport["status"], string> = {
  open: "Open",
  dismissed: "Dismissed",
  actioned: "Listing removed",
};

export default function SportsMarketReportsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("sports_market:write");
  const [status, setStatus] = useState("open");
  const { data, loading, refreshing, error, refresh } = useAdminQuery<{ reports: SmReport[]; open_count: number }>({
    key: adminCacheKey(["sports-market", "reports", status]),
    fetcher: () => smGet<{ reports: SmReport[]; open_count: number }>(`/reports?status=${status}&limit=200`),
  });
  const reports = data?.reports ?? [];
  const [acting, setActing] = useState<{ report: SmReport; action: Action } | null>(null);

  return (
    <div>
      <AdminPageHeader
        title="Sports Marketplace"
        description={
          data
            ? `${data.open_count} open report${data.open_count === 1 ? "" : "s"}. Removing a listing hides it from the app and closes every open report on it.`
            : "Listings people flagged from the app."
        }
        actions={<AdminReloadButton onClick={refresh} refreshing={refreshing} />}
      />
      <SmTabs />
      <AdminFilterPanel>
        <AdminSelect value={status} onChange={setStatus}>
          <option value="open">Open</option>
          <option value="actioned">Listing removed</option>
          <option value="dismissed">Dismissed</option>
          <option value="">All</option>
        </AdminSelect>
      </AdminFilterPanel>
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {loading && !data ? <AdminLoadingRow label="Loading reports…" /> : null}
        {!loading && reports.length === 0 && !error ? (
          <AdminEmpty
            title={status === "open" ? "No open reports" : "No reports"}
            description="When someone reports a listing in the app, it shows up here."
          />
        ) : null}
        {reports.length ? (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">Listing</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Reported by</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {r.product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.product.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="h-12 w-12 shrink-0 rounded-lg bg-muted" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">{r.product.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <StatusBadge tone={moderationTone(r.product.status ?? undefined)}>
                            {labelize(r.product.status)}
                          </StatusBadge>
                          {r.open_count > 1 ? <StatusBadge tone="warning">{r.open_count} open reports</StatusBadge> : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[320px] px-4 py-3">
                    <p className="font-medium text-text-primary">{r.reason_label}</p>
                    {r.details ? <p className="whitespace-pre-wrap text-text-secondary">{r.details}</p> : null}
                    {r.admin_note ? <p className="mt-1 text-xs text-text-hint">Note: {r.admin_note}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-text-primary">{r.reporter.name ?? "—"}</p>
                    <p className="text-xs text-text-secondary">
                      {r.reporter.username ? `@${r.reporter.username} · ` : ""}
                      {shortDate(r.created_at)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && r.status === "open" ? (
                      <div className="flex justify-end gap-2">
                        <button type="button" className={buttonClass} onClick={() => setActing({ report: r, action: "dismiss" })}>
                          Dismiss
                        </button>
                        <button
                          type="button"
                          className={`${buttonClass} text-danger`}
                          onClick={() => setActing({ report: r, action: "remove" })}
                        >
                          Remove listing
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </AdminTableShell>

      <ReasonModal
        open={!!acting}
        title={acting ? `${acting.action === "remove" ? "Remove listing" : "Dismiss report"}: ${acting.report.product.name}` : ""}
        label={acting?.action === "remove" ? "Reason shown to the seller" : "Note (optional, internal)"}
        required={acting?.action === "remove"}
        saveLabel={acting?.action === "remove" ? "Remove listing" : "Dismiss"}
        onClose={() => setActing(null)}
        onSubmit={async (note) => {
          if (!acting) return;
          await smPost(`/reports/${acting.report.id}/resolve`, { action: acting.action, note });
          refresh();
        }}
      />
    </div>
  );
}
