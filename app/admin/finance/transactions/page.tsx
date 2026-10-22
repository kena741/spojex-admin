"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminReloadButton,
  AdminSearchInput,
  AdminSelect,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { cn, formatDate, formatDateTime, formatStatusLabel } from "@/lib/utils";

type Person = {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
} | null;

type TxRow = {
  id: string;
  source: string;
  asset_class: string;
  currency: string;
  amount: string;
  status: string;
  status_group: string;
  direction: string;
  tx_type: string;
  module: string;
  purpose: string;
  provider_ref: string | null;
  payment_provider: string;
  payer: Person;
  beneficiary: Person;
  platform_commission: string | null;
  recipient_net: string | null;
  occurred_at: string | null;
  verified_at: string | null;
  is_sale: boolean;
};

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
};

type SummaryPayload = {
  by_currency?: CurrencySummary[];
  trends?: { day: string; currency: string; verified_payments: string; commission: string }[];
  notes?: string[];
  gaps?: string[];
  window?: { start?: string; end?: string };
};

type DetailPayload = {
  transaction: TxRow;
  breakdown: {
    gross: string;
    currency: string;
    discount: string | null;
    platform_commission: string | null;
    processing_fee: string | null;
    tax: string | null;
    recipient_net: string | null;
    unavailable: string[];
  };
  money_flow: {
    currency: string;
    payer_paid: string | null;
    platform_retained: string | null;
    recipient_earned: string | null;
    paid_out: string | null;
    asset_class: string;
  };
  timeline: { key: string; label: string; at: string | null; status: string; amount?: string }[];
  related: Record<string, unknown>;
  reconciliation_flags: { severity: string; code: string; message: string }[];
  notes?: string[];
};

type ListPayload = {
  data?: TxRow[];
  total?: number;
  business_total?: number;
  ledger_total?: number;
  source?: string;
};

const PAGE_SIZE = 40;

function money(amount: string | null | undefined, currency = "ETB") {
  if (amount == null || amount === "") return "-";
  if (currency === "COIN") {
    return `${Number(amount).toLocaleString("en-US")} coins`;
  }
  return `${currency} ${Number(amount).toLocaleString("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusTone(group: string): "success" | "warning" | "danger" | "neutral" | "info" {
  if (group === "verified" || group === "paid" || group === "posted") return "success";
  if (group === "pending") return "warning";
  if (group === "failed" || group === "refunded") return group === "refunded" ? "info" : "danger";
  return "neutral";
}

function personHref(id?: string | null) {
  return id ? `/admin/people/${id}` : null;
}

export default function FinanceTransactionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canExport = can("finance:export") || can("finance:read");

  const range = searchParams.get("range") || "30d";
  const rangeStart = searchParams.get("start") || "";
  const rangeEnd = searchParams.get("end") || "";
  const assetClass = searchParams.get("asset") || "all";
  const module = searchParams.get("module") || "";
  const status = searchParams.get("status") || "";
  const txType = searchParams.get("type") || "";
  const provider = searchParams.get("provider") || "";
  const currency = searchParams.get("currency") || "";
  const view = searchParams.get("view") || "all";
  const q = searchParams.get("q") || "";
  const page = Math.max(Number(searchParams.get("page") || 1) || 1, 1);
  const selectedId = searchParams.get("id") || "";

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

  const windowParams = useMemo(() => {
    const p = new URLSearchParams({ range });
    if (range === "custom" && rangeStart && rangeEnd) {
      p.set("start", rangeStart);
      p.set("end", rangeEnd);
    }
    return p;
  }, [range, rangeStart, rangeEnd]);

  const summaryQuery = useAdminQuery<SummaryPayload & { source?: string }>({
    key: adminCacheKey(["finance", "transactions", "summary", windowParams.toString()]),
    fetcher: async () => {
      const res = await fetch(`/api/admin/finance/transactions/summary?${windowParams}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as SummaryPayload & { error?: string; source?: string };
      if (!res.ok) throw new Error(payload.error || "Summary failed");
      return payload;
    },
  });
  // Summary failure is soft - list error is the primary signal.
  const summary = summaryQuery.data;
  const summaryLoading = summaryQuery.loading;

  const listQuery = useAdminQuery<ListPayload>({
    key: adminCacheKey([
      "finance",
      "transactions",
      "list",
      range,
      rangeStart,
      rangeEnd,
      page,
      assetClass,
      module,
      status,
      txType,
      provider,
      currency,
      view,
      q,
    ]),
    fetcher: async () => {
      const params = new URLSearchParams({
        range,
        page: String(page),
        page_size: String(PAGE_SIZE),
        sort: "occurred_at",
        order: "desc",
      });
      if (range === "custom" && rangeStart && rangeEnd) {
        params.set("start", rangeStart);
        params.set("end", rangeEnd);
      }
      if (assetClass && assetClass !== "all") params.set("asset_class", assetClass);
      if (module) params.set("module", module);
      if (status) params.set("status", status);
      if (txType) params.set("tx_type", txType);
      if (provider) params.set("provider", provider);
      if (currency) params.set("currency", currency);
      if (view && view !== "all") params.set("view", view);
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/finance/transactions?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as ListPayload & { error?: string; code?: string };
      if (!res.ok) {
        const err = new Error(payload.error || "Failed to load transactions") as Error & {
          code?: string;
        };
        err.code = payload.code || (res.status === 403 ? "permission_denied" : "api_error");
        throw err;
      }
      return payload;
    },
  });
  const loading = listQuery.loading;
  const listData = listQuery.data;
  const rows = listData?.data ?? [];
  const total = listData?.total ?? 0;
  const businessTotal = listData?.business_total ?? 0;
  const ledgerTotal = listData?.ledger_total ?? 0;
  const listOk = listData != null;
  const dataSource = listData?.source ?? summary?.source ?? null;

  const detailQuery = useAdminQuery<DetailPayload>({
    key: selectedId
      ? adminCacheKey(["finance", "transactions", "detail", selectedId])
      : null,
    enabled: Boolean(selectedId),
    fetcher: async () => {
      const res = await fetch(`/api/admin/finance/transactions/${encodeURIComponent(selectedId)}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Detail failed");
      return payload as DetailPayload;
    },
  });
  const detail = selectedId ? detailQuery.data : null;
  const detailLoading = detailQuery.loading;

  const error = listQuery.error ?? detailQuery.error;
  const refreshing = listQuery.refreshing || summaryQuery.refreshing || detailQuery.refreshing;

  const reloadAll = useCallback(() => {
    void summaryQuery.refresh();
    void listQuery.refresh();
    if (selectedId) void detailQuery.refresh();
  }, [summaryQuery, listQuery, detailQuery, selectedId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const moneySummaries = (summary?.by_currency ?? []).filter((c) => c.currency !== "COIN");
  const coinSummary = (summary?.by_currency ?? []).find((c) => c.currency === "COIN");
  const primary = moneySummaries[0] ?? null;

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ range });
    if (assetClass && assetClass !== "all") params.set("asset_class", assetClass);
    if (module) params.set("module", module);
    if (status) params.set("status", status);
    if (txType) params.set("tx_type", txType);
    if (currency) params.set("currency", currency);
    return `/api/admin/finance/transactions/export?${params}`;
  }, [assetClass, currency, module, range, status, txType]);

  const trendMax = useMemo(() => {
    const vals = (summary?.trends ?? [])
      .filter((t) => t.currency !== "COIN")
      .map((t) => Number(t.verified_payments) || 0);
    return Math.max(...vals, 1);
  }, [summary?.trends]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Transactions"
        description="Unified money and coin history across Spojex products"
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton
              loading={loading || summaryLoading}
              refreshing={refreshing}
              onClick={reloadAll}
            />
            <button
              type="button"
              onClick={() =>
                writeParams({
                  module: "coins",
                  type: "customer_payment",
                  asset: "money",
                  page: "1",
                })
              }
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-text-secondary hover:text-foreground"
            >
              View coin purchases
            </button>
            {canExport ? (
              <a
                href={exportHref}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-text-secondary hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </a>
            ) : null}
          </div>
        }
      />

      {error ? (
        <div className="space-y-2">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            onClick={reloadAll}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            Retry
          </button>
        </div>
      ) : null}

      {dataSource === "admin_local_fallback" && !error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Showing admin local aggregation - Python finance API was unavailable. Coin purchases and
          other payment tables are included from the database directly.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {[
          { id: "7d", label: "7 days" },
          { id: "30d", label: "30 days" },
          { id: "90d", label: "90 days" },
          { id: "365d", label: "12 months" },
        ].map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => writeParams({ range: r.id, page: "1" })}
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          label="Verified customer payments"
          value={primary ? money(primary.verified_customer_payments, primary.currency) : "-"}
          hint="Confirmed checkouts only - not wallet credits"
          loading={summaryLoading}
        />
        <Kpi
          label="Platform commission earned"
          value={primary ? money(primary.platform_commission_earned, primary.currency) : "-"}
          hint="Only amounts recorded on the payment"
          loading={summaryLoading}
        />
        <Kpi
          label="Provider earnings"
          value={primary ? money(primary.provider_earnings, primary.currency) : "-"}
          hint="Recipient net where stored"
          loading={summaryLoading}
        />
        <Kpi
          label="Refunds"
          value={primary ? money(primary.refunds, primary.currency) : "-"}
          loading={summaryLoading}
        />
        <Kpi
          label="Completed payouts"
          value={primary ? money(primary.completed_payouts, primary.currency) : "-"}
          hint="Admin-marked withdrawals & coin redemptions"
          loading={summaryLoading}
        />
        <Kpi
          label="Pending withdrawals"
          value={primary ? money(primary.pending_withdrawals, primary.currency) : "-"}
          loading={summaryLoading}
        />
      </div>

      {coinSummary ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-hint">
            Virtual coins (separate from real money)
          </p>
          <p className="mt-1 text-text-secondary">
            Credits {money(coinSummary.coin_credits ?? coinSummary.verified_customer_payments, "COIN")}
            {" · "}
            Debits {money(coinSummary.coin_debits ?? "0", "COIN")}
          </p>
        </div>
      ) : null}

      {moneySummaries.length > 1 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase text-text-hint">By currency</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {moneySummaries.map((c) => (
              <li key={c.currency} className="rounded-lg border border-border px-3 py-2">
                <span className="font-medium">{c.currency}</span>
                <span className="ml-2 text-text-secondary">
                  payments {money(c.verified_customer_payments, c.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(summary?.trends?.length ?? 0) > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 font-heading text-sm font-semibold">Verified payment trend</h2>
          <div className="flex h-28 items-end gap-1">
            {(summary?.trends ?? [])
              .filter((t) => t.currency !== "COIN")
              .slice(-28)
              .map((t) => {
                const h = Math.max(4, (Number(t.verified_payments) / trendMax) * 100);
                return (
                  <div
                    key={`${t.day}-${t.currency}`}
                    title={`${t.day}: ${money(t.verified_payments, t.currency)}`}
                    className="flex-1 rounded-t bg-primary/80"
                    style={{ height: `${h}%` }}
                  />
                );
              })}
          </div>
        </section>
      ) : null}

      {listOk ? (
        <p className="text-xs text-text-secondary">
          Showing {total.toLocaleString()} rows
          {view === "all"
            ? ` · business ${businessTotal.toLocaleString()} · ledger ${ledgerTotal.toLocaleString()}`
            : ""}
          {view === "business" ? " (business transactions only - not ledger echoes)" : ""}
          {view === "ledger" ? " (ledger entries only)" : ""}
        </p>
      ) : null}

      <AdminFilterPanel>
        <div className="grid gap-2 md:grid-cols-[1fr_120px_120px_130px_130px_130px_120px]">
          <AdminSearchInput
            value={q}
            onChange={(value) => writeParams({ q: value || null, page: "1" })}
            placeholder="Search ref, purpose, payer…"
          />
          <AdminSelect
            value={view || "all"}
            onChange={(value) =>
              writeParams({ view: value === "all" ? null : value, page: "1" })
            }
          >
            <option value="all">All records</option>
            <option value="business">Business txns</option>
            <option value="ledger">Ledger entries</option>
          </AdminSelect>
          <AdminSelect
            value={assetClass || "all"}
            onChange={(value) =>
              writeParams({ asset: value === "all" ? null : value, page: "1" })
            }
          >
            <option value="all">All assets</option>
            <option value="money">Real money</option>
            <option value="coin">Coins</option>
          </AdminSelect>
          <AdminSelect
            value={module || "all"}
            onChange={(value) =>
              writeParams({ module: value === "all" ? null : value, page: "1" })
            }
          >
            <option value="all">All modules</option>
            <option value="service">Services</option>
            <option value="gym">Gyms</option>
            <option value="stadium">Stadiums</option>
            <option value="event">Events</option>
            <option value="coins">Coins</option>
            <option value="gifts">Gifts</option>
            <option value="donations">Donations</option>
            <option value="wallet">Wallet</option>
            <option value="mini_app">Mini apps</option>
            <option value="featured">Featured</option>
            <option value="opportunity">Opportunities</option>
          </AdminSelect>
          <AdminSelect
            value={status || "all"}
            onChange={(value) =>
              writeParams({ status: value === "all" ? null : value, page: "1" })
            }
          >
            <option value="all">All statuses</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid out</option>
            <option value="refunded">Refunded</option>
            <option value="failed">Failed</option>
            <option value="posted">Posted</option>
          </AdminSelect>
          <AdminSelect
            value={txType || "all"}
            onChange={(value) =>
              writeParams({ type: value === "all" ? null : value, page: "1" })
            }
          >
            <option value="all">All types</option>
            <option value="customer_payment">Customer payment</option>
            <option value="provider_earning">Provider earning</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="refund">Refund</option>
            <option value="donation">Donation</option>
            <option value="gift">Gift</option>
            <option value="coin_redemption">Coin redemption</option>
            <option value="adjustment">Adjustment</option>
          </AdminSelect>
          <AdminSelect
            value={provider || "all"}
            onChange={(value) =>
              writeParams({ provider: value === "all" ? null : value, page: "1" })
            }
          >
            <option value="all">All providers</option>
            <option value="chapa">Chapa</option>
            <option value="cash">Cash</option>
            <option value="wallet">Wallet</option>
            <option value="manual_payout">Manual payout</option>
            <option value="coins">Coins</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-text-secondary">
            <span>{total.toLocaleString()} transactions</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => writeParams({ page: String(page - 1) })}
                className="rounded border border-border p-1 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => writeParams({ page: String(page + 1) })}
                className="rounded border border-border p-1 disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {loading ? (
            <AdminLoadingRow label="Loading transactions…" compact className="py-10" />
          ) : listOk && rows.length === 0 && !error ? (
            <AdminEmpty
              title="No transactions in this window"
              description="Try expanding the date range or clearing filters. This empty state only appears after a successful API response."
            />
          ) : rows.length > 0 ? (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const Incoming = row.direction === "incoming";
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => writeParams({ id: row.id })}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40",
                      selectedId === row.id && "bg-secondary/60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        Incoming ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800",
                      )}
                    >
                      {Incoming ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{row.purpose}</p>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">
                          {row.module}
                        </span>
                        {row.asset_class === "coin" ? (
                          <span className="text-[10px] font-medium text-text-hint">COIN</span>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-text-secondary">
                        {[
                          row.payer?.display_name,
                          row.beneficiary?.display_name
                            ? `→ ${row.beneficiary.display_name}`
                            : null,
                          row.provider_ref,
                          row.occurred_at ? formatDate(row.occurred_at) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          Incoming ? "text-emerald-700" : "text-foreground",
                        )}
                      >
                        {Incoming ? "+" : "−"}
                        {money(row.amount, row.currency)}
                      </p>
                      <StatusBadge tone={statusTone(row.status_group)}>
                        {formatStatusLabel(row.status_group)}
                      </StatusBadge>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          ) : null}
      </div>

      {(summary?.notes?.length || summary?.gaps?.length) && !loading ? (
        <details className="rounded-xl border border-border bg-card p-4 text-xs text-text-secondary shadow-sm">
          <summary className="cursor-pointer font-medium text-foreground">
            Reconciliation notes & data gaps
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {(summary?.notes ?? []).map((n) => (
              <li key={n}>{n}</li>
            ))}
            {(summary?.gaps ?? []).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {selectedId ? (
        <TransactionDrawer
          loading={detailLoading}
          detail={detail}
          onClose={() => writeParams({ id: null })}
        />
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-hint">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-28 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{value}</p>
      )}
      {hint ? <p className="mt-1 text-[11px] text-text-hint">{hint}</p> : null}
    </div>
  );
}

function TransactionDrawer({
  loading,
  detail,
  onClose,
}: {
  loading: boolean;
  detail: DetailPayload | null;
  onClose: () => void;
}) {
  const tx = detail?.transaction;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Transaction detail"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-heading text-sm font-semibold">Transaction detail</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-text-secondary" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading || !tx ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-5 w-2/3 rounded bg-muted" />
              <div className="h-4 w-1/2 rounded bg-muted" />
              <div className="h-24 rounded bg-muted" />
            </div>
          ) : (
            <div className="space-y-5 text-sm">
              <div>
                <p className="font-heading text-base font-semibold">{tx.purpose}</p>
                <p className="mt-1 font-mono text-[11px] text-text-hint break-all">{tx.id}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge tone={statusTone(tx.status_group)}>
                    {formatStatusLabel(tx.status_group)}
                  </StatusBadge>
                  <span className="rounded border border-border px-2 py-0.5 text-[10px] uppercase">
                    {tx.asset_class}
                  </span>
                  <span className="rounded border border-border px-2 py-0.5 text-[10px] uppercase">
                    {tx.module}
                  </span>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-text-hint">Amount</dt>
                  <dd className="font-semibold">{money(tx.amount, tx.currency)}</dd>
                </div>
                <div>
                  <dt className="text-text-hint">Provider</dt>
                  <dd className="font-medium">{tx.payment_provider}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-text-hint">Provider reference</dt>
                  <dd className="font-mono text-[11px]">{tx.provider_ref || "-"}</dd>
                </div>
                <div>
                  <dt className="text-text-hint">Occurred</dt>
                  <dd>{tx.occurred_at ? formatDateTime(tx.occurred_at) : "-"}</dd>
                </div>
                <div>
                  <dt className="text-text-hint">Verified</dt>
                  <dd>{tx.verified_at ? formatDateTime(tx.verified_at) : "-"}</dd>
                </div>
              </dl>

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-hint">
                  Participants
                </h4>
                <ul className="space-y-2">
                  <Participant label="Payer" person={tx.payer} />
                  <Participant label="Beneficiary" person={tx.beneficiary} />
                </ul>
              </section>

              {detail?.breakdown ? (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-hint">
                    Amount breakdown
                  </h4>
                  <dl className="space-y-1.5 text-xs">
                    <Row label="Gross" value={money(detail.breakdown.gross, detail.breakdown.currency)} />
                    <Row
                      label="Platform commission"
                      value={
                        detail.breakdown.platform_commission != null
                          ? money(detail.breakdown.platform_commission, detail.breakdown.currency)
                          : "Unavailable"
                      }
                    />
                    <Row
                      label="Recipient net"
                      value={
                        detail.breakdown.recipient_net != null
                          ? money(detail.breakdown.recipient_net, detail.breakdown.currency)
                          : "Unavailable"
                      }
                    />
                    <Row
                      label="Discount"
                      value={
                        detail.breakdown.discount != null
                          ? money(detail.breakdown.discount, detail.breakdown.currency)
                          : "Unavailable"
                      }
                    />
                    <Row
                      label="Processing fee"
                      value={
                        detail.breakdown.processing_fee != null
                          ? money(detail.breakdown.processing_fee, detail.breakdown.currency)
                          : "Unavailable"
                      }
                    />
                    <Row
                      label="Tax"
                      value={
                        detail.breakdown.tax != null
                          ? money(detail.breakdown.tax, detail.breakdown.currency)
                          : "Unavailable"
                      }
                    />
                  </dl>
                </section>
              ) : null}

              {detail?.money_flow ? (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-hint">
                    Money flow
                  </h4>
                  <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                    <FlowStep
                      label="Customer paid"
                      value={detail.money_flow.payer_paid}
                      currency={detail.money_flow.currency}
                    />
                    <FlowStep
                      label="Platform retained"
                      value={detail.money_flow.platform_retained}
                      currency={detail.money_flow.currency}
                    />
                    <FlowStep
                      label="Recipient earned"
                      value={detail.money_flow.recipient_earned}
                      currency={detail.money_flow.currency}
                    />
                    <FlowStep
                      label="Paid out"
                      value={detail.money_flow.paid_out}
                      currency={detail.money_flow.currency}
                    />
                  </div>
                </section>
              ) : null}

              {detail?.timeline?.length ? (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-hint">
                    Timeline
                  </h4>
                  <ol className="relative space-y-3 border-l border-border pl-4">
                    {detail.timeline.map((ev) => (
                      <li key={ev.key} className="relative">
                        <span
                          className={cn(
                            "absolute -left-[1.15rem] top-1 h-2.5 w-2.5 rounded-full border border-border",
                            ev.status === "failed"
                              ? "bg-red-500"
                              : ev.status === "active"
                                ? "bg-amber-400"
                                : "bg-primary",
                          )}
                        />
                        <p className="font-medium">{ev.label}</p>
                        <p className="text-[11px] text-text-hint">
                          {ev.at ? formatDateTime(ev.at) : "-"}
                          {ev.amount ? ` · ${ev.amount}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {detail?.reconciliation_flags?.length ? (
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-text-hint">
                    Flags
                  </h4>
                  {detail.reconciliation_flags.map((f) => (
                    <p
                      key={f.code}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                    >
                      {f.message}
                    </p>
                  ))}
                </section>
              ) : null}

              {detail?.related ? (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-hint">
                    Related records
                  </h4>
                  <RelatedLinks related={detail.related} />
                </section>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Participant({ label, person }: { label: string; person: Person }) {
  if (!person) {
    return (
      <li className="text-xs text-text-hint">
        {label}: -
      </li>
    );
  }
  const href = personHref(person.id);
  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span className="text-text-hint">{label}</span>
      {href ? (
        <Link href={href} className="font-medium text-primary hover:underline">
          {person.display_name || person.email || person.id.slice(0, 8)}
        </Link>
      ) : (
        <span>{person.display_name || "-"}</span>
      )}
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-hint">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function FlowStep({
  label,
  value,
  currency,
}: {
  label: string;
  value: string | null;
  currency: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-text-hint">{label}</span>
      <span className="font-medium tabular-nums">
        {value != null ? money(value, currency) : "-"}
      </span>
    </div>
  );
}

function RelatedLinks({ related }: { related: Record<string, unknown> }) {
  const items: { label: string; href?: string; note?: string }[] = [];
  const gym = related.gym as { admin_href?: string; id?: string } | undefined;
  if (gym?.admin_href) items.push({ label: `Gym ${gym.id?.slice(0, 8)}`, href: gym.admin_href });
  const booking = related.booking as { admin_href?: string; id?: string; status?: string } | undefined;
  if (booking) {
    items.push({
      label: `Booking ${booking.id?.slice(0, 8)} (${booking.status})`,
      href: booking.admin_href,
    });
  }
  const withdrawal = related.withdrawal as {
    admin_href?: string;
    status?: string;
    payout_confirmation?: string;
    allocation?: string;
  } | undefined;
  if (withdrawal) {
    items.push({
      label: `Withdrawal (${withdrawal.status})`,
      href: withdrawal.admin_href,
      note: `${withdrawal.payout_confirmation}; ${withdrawal.allocation}`,
    });
  }
  const redemption = related.coin_redemption as { admin_href?: string; status?: string } | undefined;
  if (redemption) {
    items.push({
      label: `Coin redemption (${redemption.status})`,
      href: redemption.admin_href,
    });
  }
  const walletEntries = related.wallet_entries as { tx_id?: string; kind?: string }[] | undefined;
  for (const w of walletEntries ?? []) {
    if (w.tx_id) items.push({ label: `Wallet ${w.kind}`, note: w.tx_id });
  }
  const audit = related.audit_events as { summary?: string; admin_name?: string }[] | undefined;
  for (const a of (audit ?? []).slice(0, 3)) {
    items.push({ label: a.summary || "Audit event", note: a.admin_name || undefined });
  }

  if (!items.length) {
    return <p className="text-xs text-text-hint">No linked records beyond this row.</p>;
  }
  return (
    <ul className="space-y-2 text-xs">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`}>
          {item.href ? (
            <Link href={item.href} className="text-primary hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium">{item.label}</span>
          )}
          {item.note ? <p className="text-text-hint">{item.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}
