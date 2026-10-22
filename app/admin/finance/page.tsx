"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { cn, formatDateTime } from "@/lib/utils";

type CurrencySummary = {
  currency: string;
  verified_customer_payments: string;
  platform_commission_earned: string;
  provider_earnings: string;
  refunds: string;
  completed_payouts: string;
  pending_withdrawals: string;
  coin_credits?: string | null;
  coin_debits?: string | null;
  gift_coins_sent?: string | null;
};

type ModuleRow = {
  module: string;
  currency: string;
  business_tx_count: number;
  verified_collections: string;
  commission: string;
  refunds: string;
  drilldown_href?: string;
};

type AttentionItem = {
  code: string;
  severity: string;
  count: number;
  label: string;
  href: string;
};

type SummaryPayload = {
  by_currency?: CurrencySummary[];
  previous_by_currency?: CurrencySummary[];
  trends?: {
    day: string;
    currency: string;
    verified_payments: string;
    refunds?: string;
    commission: string;
  }[];
  module_breakdown?: ModuleRow[];
  counts?: {
    business_transactions?: number;
    verified_business_transactions?: number;
    pending_payment_attempts?: number;
    ledger_entries?: number;
    gift_ledger_rows?: number;
  };
  balances_snapshot?: {
    provider_wallet_available?: string | null;
    provider_wallet_reserved?: string | null;
    note?: string;
  };
  needs_attention?: AttentionItem[];
  metric_drilldowns?: Record<string, string>;
  window?: {
    start?: string;
    end?: string;
    timezone?: string;
    label?: string;
    bucket?: string;
  };
  notes?: string[];
  gaps?: string[];
  source?: string;
  generated_at?: string;
  error?: string;
};

function money(amount: string | null | undefined, currency = "ETB") {
  if (amount == null || amount === "") return "Unavailable";
  if (currency === "COIN") return `${Number(amount).toLocaleString("en-US")} coins`;
  return `${currency} ${Number(amount).toLocaleString("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function deltaLabel(current?: string | null, previous?: string | null) {
  if (current == null || previous == null) return null;
  const c = Number(current);
  const p = Number(previous);
  if (Number.isNaN(c) || Number.isNaN(p)) return null;
  const diff = c - p;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toLocaleString("en-ET", { maximumFractionDigits: 2 })} vs prior period`;
}

export default function FinanceOverviewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "30d";
  const customStart = searchParams.get("start") || "";
  const customEnd = searchParams.get("end") || "";

  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const writeParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
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
    setOk(false);
    try {
      const qs = new URLSearchParams();
      qs.set("range", range);
      if (range === "custom" && customStart && customEnd) {
        qs.set("start", customStart);
        qs.set("end", customEnd);
      }
      const res = await fetch(`/api/admin/finance/transactions/summary?${qs}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as SummaryPayload;
      if (!res.ok) throw new Error(payload.error || "Failed to load finance overview");
      setSummary(payload);
      setOk(true);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [range, customStart, customEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const moneyRows = (summary?.by_currency ?? []).filter((c) => c.currency !== "COIN");
  const prevMoney = (summary?.previous_by_currency ?? []).filter((c) => c.currency !== "COIN");
  const coinRow = (summary?.by_currency ?? []).find((c) => c.currency === "COIN");
  const primary = moneyRows[0] ?? null;
  const prevPrimary = prevMoney.find((c) => c.currency === primary?.currency) ?? prevMoney[0] ?? null;
  const drills = summary?.metric_drilldowns ?? {};

  const trendRows = useMemo(
    () => (summary?.trends ?? []).filter((t) => t.currency !== "COIN"),
    [summary?.trends],
  );
  const trendMax = Math.max(
    1,
    ...trendRows.map((t) => Number(t.verified_payments) || 0),
  );

  const rangeHref = (path: string) => {
    const u = new URL(path, "http://local");
    u.searchParams.set("range", range);
    if (range === "custom" && customStart && customEnd) {
      u.searchParams.set("start", customStart);
      u.searchParams.set("end", customEnd);
    }
    return `${u.pathname}?${u.searchParams}`;
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Finance overview"
        description="Verified collections vs platform revenue, refunds, recipient earnings, and payouts — money and coins kept separate."
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
              href={rangeHref("/admin/finance/transactions?view=business")}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium"
            >
              Open transactions
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        <span>{summary?.window?.label || "Period"}</span>
        <span>· {summary?.window?.timezone || "Africa/Addis_Ababa"}</span>
        {updatedAt ? <span>· Updated {formatDateTime(updatedAt)}</span> : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          { id: "7d", label: "7 days" },
          { id: "30d", label: "30 days" },
          { id: "90d", label: "90 days" },
          { id: "365d", label: "12 months" },
          { id: "custom", label: "Custom" },
        ].map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => writeParams({ range: r.id, start: r.id === "custom" ? customStart || null : null, end: r.id === "custom" ? customEnd || null : null })}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium",
              range === r.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-text-secondary hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {range === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            Start
            <input
              type="date"
              value={customStart}
              onChange={(e) => writeParams({ range: "custom", start: e.target.value, end: customEnd || e.target.value })}
              className="mt-1 block h-9 rounded-lg border border-border bg-card px-2 text-sm"
            />
          </label>
          <label className="text-xs">
            End
            <input
              type="date"
              value={customEnd}
              onChange={(e) => writeParams({ range: "custom", start: customStart || e.target.value, end: e.target.value })}
              className="mt-1 block h-9 rounded-lg border border-border bg-card px-2 text-sm"
            />
          </label>
        </div>
      ) : null}

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

      {summary?.source === "admin_local_fallback" && ok ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Overview is using local aggregation while the Python finance API catches up.
        </p>
      ) : null}

      {loading ? <AdminLoadingRow label="Loading finance overview…" /> : null}

      {!loading && ok ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Kpi
              label="Verified customer collections"
              value={primary ? money(primary.verified_customer_payments, primary.currency) : "Unavailable"}
              hint="Period activity — confirmed checkouts only (not wallet credits)"
              delta={deltaLabel(primary?.verified_customer_payments, prevPrimary?.verified_customer_payments)}
              href={rangeHref(drills.verified_customer_payments || "/admin/finance/transactions?status=verified&view=business&asset=money")}
            />
            <Kpi
              label="Platform commissions & fees"
              value={primary ? money(primary.platform_commission_earned, primary.currency) : "Unavailable"}
              hint="Only amounts recorded on payment rows at transaction time"
              delta={deltaLabel(primary?.platform_commission_earned, prevPrimary?.platform_commission_earned)}
              href={rangeHref(drills.platform_commission_earned || "/admin/finance/transactions?status=verified&view=business&asset=money")}
            />
            <Kpi
              label="Recorded recipient earnings"
              value={primary ? money(primary.provider_earnings, primary.currency) : "Unavailable"}
              hint="Recipient net where stored — not inferred from current rates"
              delta={deltaLabel(primary?.provider_earnings, prevPrimary?.provider_earnings)}
            />
            <Kpi
              label="Completed refunds"
              value={primary ? money(primary.refunds, primary.currency) : "Unavailable"}
              delta={deltaLabel(primary?.refunds, prevPrimary?.refunds)}
              href={rangeHref(drills.refunds || "/admin/finance/transactions?status=refunded&asset=money")}
            />
            <Kpi
              label="Pending payout requests"
              value={primary ? money(primary.pending_withdrawals, primary.currency) : "Unavailable"}
              hint="Current queue — withdrawals + coin redemptions"
              href={drills.pending_withdrawals || "/admin/finance/payouts?status=pending"}
            />
            <Kpi
              label="Recorded completed payouts"
              value={primary ? money(primary.completed_payouts, primary.currency) : "Unavailable"}
              hint="Manually marked paid — not bank execution"
              href={drills.completed_payouts || "/admin/finance/payouts?status=paid"}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatChip
              label="Business transactions"
              value={String(summary?.counts?.business_transactions ?? "—")}
              hint="Checkout rows in period"
            />
            <StatChip
              label="Verified checkouts"
              value={String(summary?.counts?.verified_business_transactions ?? "—")}
            />
            <StatChip
              label="Ledger entries"
              value={String(summary?.counts?.ledger_entries ?? "—")}
              hint="Wallet + coin movements — not purchases"
            />
            <StatChip
              label="Pending payment attempts"
              value={String(summary?.counts?.pending_payment_attempts ?? "—")}
            />
          </div>

          {summary?.balances_snapshot ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-hint">
                Current balances (snapshot — not period activity)
              </p>
              <p className="mt-1">
                Provider wallets available:{" "}
                {money(summary.balances_snapshot.provider_wallet_available, "ETB")}
                {summary.balances_snapshot.provider_wallet_reserved
                  ? ` · Reserved: ${money(summary.balances_snapshot.provider_wallet_reserved, "ETB")}`
                  : ""}
              </p>
              <p className="mt-1 text-[11px] text-text-hint">
                {summary.balances_snapshot.note}
              </p>
            </div>
          ) : null}

          {coinRow ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-hint">
                Virtual coins (not money)
              </p>
              <p className="mt-1 text-text-secondary">
                Issuance credits {money(coinRow.coin_credits, "COIN")} · Debits{" "}
                {money(coinRow.coin_debits, "COIN")}
                {coinRow.gift_coins_sent
                  ? ` · Gifts sent ${money(coinRow.gift_coins_sent, "COIN")}`
                  : ""}
              </p>
              <Link
                href={rangeHref(drills.gifts || "/admin/finance/transactions?module=gifts")}
                className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
              >
                Open gift activity
              </Link>
            </div>
          ) : null}

          {(summary?.needs_attention?.length ?? 0) > 0 ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
              <h2 className="mb-2 font-heading text-sm font-semibold text-amber-950">
                Needs attention
              </h2>
              <ul className="space-y-2">
                {(summary?.needs_attention ?? []).map((item) => (
                  <li key={item.code} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {item.label}{" "}
                      <span className="text-xs text-amber-900/80">({item.count})</span>
                    </span>
                    <Link href={item.href} className="text-xs font-medium text-primary hover:underline">
                      Review
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {trendRows.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-heading text-sm font-semibold">
                  Collections / refunds ({summary?.window?.bucket || "day"})
                </h2>
                <p className="text-[11px] text-text-hint">
                  Chart totals use the same verified-checkout definition as KPIs
                </p>
              </div>
              <div className="flex h-28 items-end gap-1" role="img" aria-label="Collections trend">
                {trendRows.slice(-42).map((t) => {
                  const h = Math.max(4, (Number(t.verified_payments) / trendMax) * 100);
                  return (
                    <div
                      key={`${t.day}-${t.currency}`}
                      title={`${t.day}: collections ${money(t.verified_payments, t.currency)}${
                        t.refunds ? ` · refunds ${money(t.refunds, t.currency)}` : ""
                      }`}
                      className="flex-1 rounded-t bg-primary/80"
                      style={{ height: `${h}%` }}
                    />
                  );
                })}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-border text-text-secondary">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Period</th>
                      <th className="px-2 py-1.5 font-semibold">Currency</th>
                      <th className="px-2 py-1.5 font-semibold">Collections</th>
                      <th className="px-2 py-1.5 font-semibold">Refunds</th>
                      <th className="px-2 py-1.5 font-semibold">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendRows.slice(-14).map((t) => (
                      <tr key={`tbl-${t.day}-${t.currency}`} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5">{t.day}</td>
                        <td className="px-2 py-1.5">{t.currency}</td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {money(t.verified_payments, t.currency)}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {t.refunds != null ? money(t.refunds, t.currency) : "—"}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {money(t.commission, t.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {(summary?.module_breakdown?.length ?? 0) > 0 ? (
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-3 font-heading text-sm font-semibold">Module breakdown</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-2 py-2 font-semibold">Module</th>
                      <th className="px-2 py-2 font-semibold">Verified txns</th>
                      <th className="px-2 py-2 font-semibold">Collections</th>
                      <th className="px-2 py-2 font-semibold">Commission</th>
                      <th className="px-2 py-2 font-semibold">Refunds</th>
                      <th className="px-2 py-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.module_breakdown ?? []).map((row) => (
                      <tr key={`${row.module}-${row.currency}`} className="border-b border-border last:border-0">
                        <td className="px-2 py-2 font-medium">{row.module}</td>
                        <td className="px-2 py-2 tabular-nums">{row.business_tx_count}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {money(row.verified_collections, row.currency)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {money(row.commission, row.currency)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {money(row.refunds, row.currency)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {row.drilldown_href ? (
                            <Link
                              href={rangeHref(row.drilldown_href)}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Open
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <QuickLink href="/admin/finance/transactions?view=business" title="Transactions" body="Business checkouts vs ledger entries" />
            <QuickLink href="/admin/finance/wallets" title="Wallets & Ledgers" body="Provider balances and chronology" />
            <QuickLink href="/admin/finance/payouts" title="Payouts" body="Withdrawals and coin redemptions" />
            <QuickLink href="/admin/finance/reconciliation" title="Reconciliation" body="Coverage gaps and stale attempts" />
          </div>

          {(summary?.notes?.length || summary?.gaps?.length) ? (
            <details className="rounded-xl border border-border bg-card p-4 text-xs text-text-secondary">
              <summary className="cursor-pointer font-medium text-foreground">
                Definitions & data gaps
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {(summary?.notes ?? []).map((n) => (
                  <li key={n}>{n}</li>
                ))}
                {(summary?.gaps ?? []).map((n) => (
                  <li key={`gap-${n}`}>{n}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  href,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  delta?: string | null;
}) {
  const inner = (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-hint">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{value}</p>
      {delta ? <p className="mt-0.5 text-[11px] text-text-secondary">{delta}</p> : null}
      {hint ? <p className="mt-1 text-[11px] text-text-hint">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function StatChip({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 shadow-sm">
      <p className="text-[11px] text-text-hint">{label}</p>
      <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[10px] text-text-hint">{hint}</p> : null}
    </div>
  );
}

function QuickLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <p className="font-heading text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-text-secondary">{body}</p>
    </Link>
  );
}
