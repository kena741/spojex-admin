"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminEmpty, AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { cn, formatDateTime } from "@/lib/utils";

type IssueItem = {
  tx_id?: string | null;
  source?: string;
  amount?: string;
  currency?: string;
  message?: string;
  href?: string;
  repair_hint?: string;
  severity?: string;
  provider_ref?: string;
  count?: number;
};

type IssueGroup = {
  code: string;
  count: number | string;
  sample_count: number;
  items: IssueItem[];
  repair_available?: boolean;
  repair_dry_run_only?: boolean;
};

type CoverageRow = {
  module: string;
  flows: string[];
  integration: string;
  notes: string;
};

type Payload = {
  generated_at?: string;
  dry_run?: boolean;
  issues?: IssueGroup[];
  coverage_matrix?: CoverageRow[];
  notes?: string[];
  error?: string;
};

const ISSUE_LABELS: Record<string, string> = {
  stale_pending: "Stale pending payment attempts",
  missing_wallet_credit: "Missing provider wallet earnings",
  missing_coin_issuance: "Coin purchases missing issuance",
  gift_unbalanced: "Gift transfers missing credit/debit pair",
  stadium_paid_pending: "Stadium paid but booking pending",
  stadium_missing_commission: "Stadium commission snapshots unavailable",
  duplicate_provider_ref: "Duplicate provider references",
  unresolved_payout_reservation: "Unresolved payout reservations",
};

export default function FinanceReconciliationPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const issue = searchParams.get("issue") || "";

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (issue) qs.set("issue", issue);
      const res = await fetch(`/api/admin/finance/reconciliation?${qs}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as Payload;
      if (!res.ok) throw new Error(payload.error || "Failed to load reconciliation");
      setData(payload);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [issue]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = data?.issues ?? [];

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Reconciliation"
        description="Coverage diagnostics for verified payments, ledger gaps, and payout reservations. Read-only - no silent balance changes."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium"
            >
              Refresh
            </button>
            <Link
              href="/admin/finance/transactions?view=business"
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium"
            >
              Open transactions
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        <span>Timezone: Africa/Addis_Ababa</span>
        {updatedAt ? <span>· Last refreshed {formatDateTime(updatedAt)}</span> : null}
        {data?.dry_run !== false ? (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">
            Dry-run diagnostics
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => router.replace(pathname)}
          className={cn(
            "rounded-md border px-2.5 py-1.5 text-xs font-medium",
            !issue
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-text-secondary",
          )}
        >
          All issues
        </button>
        {Object.entries(ISSUE_LABELS).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => router.replace(`${pathname}?issue=${id}`)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium",
              issue === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-text-secondary hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="space-y-2">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? <AdminLoadingRow label="Running reconciliation diagnostics…" /> : null}

      {!loading && !error ? (
        <>
          <div className="space-y-4">
            {groups.length === 0 ? (
              <AdminEmpty
                title="No diagnostics returned"
                description="The reconciliation API returned an empty result set."
              />
            ) : (
              groups.map((group) => (
                <section
                  key={group.code}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-heading text-sm font-semibold">
                      {ISSUE_LABELS[group.code] || group.code}
                    </h2>
                    <p className="text-xs text-text-hint">
                      {typeof group.count === "number"
                        ? `${group.count} found`
                        : `${group.count} found`}
                      {group.repair_available
                        ? " · repair available (dry-run / explicit only)"
                        : ""}
                    </p>
                  </div>
                  {group.items.length === 0 ? (
                    <p className="text-sm text-text-secondary">No matching records.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {group.items.map((item, idx) => (
                        <li key={`${group.code}-${item.tx_id || idx}`} className="py-2.5 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-foreground">
                                {item.tx_id || item.provider_ref || "Record"}
                              </p>
                              <p className="mt-0.5 text-xs text-text-secondary">
                                {item.message}
                                {item.amount
                                  ? ` · ${item.currency || ""} ${item.amount}`
                                  : ""}
                              </p>
                              {item.repair_hint ? (
                                <p className="mt-1 text-[11px] text-text-hint">
                                  Repair: {item.repair_hint}
                                </p>
                              ) : null}
                            </div>
                            {item.href ? (
                              <Link
                                href={item.href}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Open
                              </Link>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))
            )}
          </div>

          {(data?.coverage_matrix?.length ?? 0) > 0 ? (
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-3 font-heading text-sm font-semibold">
                Module coverage matrix
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-2 py-2 font-semibold">Module</th>
                      <th className="px-2 py-2 font-semibold">Integration</th>
                      <th className="px-2 py-2 font-semibold">Flows</th>
                      <th className="px-2 py-2 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.coverage_matrix ?? []).map((row) => (
                      <tr key={row.module} className="border-b border-border last:border-0">
                        <td className="px-2 py-2 font-medium">{row.module}</td>
                        <td className="px-2 py-2">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[11px] font-medium",
                              row.integration === "live"
                                ? "bg-emerald-50 text-emerald-800"
                                : row.integration === "partial"
                                  ? "bg-amber-50 text-amber-900"
                                  : "bg-muted text-text-secondary",
                            )}
                          >
                            {row.integration}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-xs text-text-secondary">
                          {(row.flows || []).join(", ") || "-"}
                        </td>
                        <td className="px-2 py-2 text-xs text-text-secondary">{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {(data?.notes?.length ?? 0) > 0 ? (
            <details className="rounded-xl border border-border bg-card p-4 text-xs text-text-secondary">
              <summary className="cursor-pointer font-medium text-foreground">
                Reconciliation notes
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {(data?.notes ?? []).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
