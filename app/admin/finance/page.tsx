"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { cn } from "@/lib/utils";

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
  source?: string;
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

export default function FinanceOverviewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "30d";

  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch(`/api/admin/finance/transactions/summary?range=${range}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as SummaryPayload;
      if (!res.ok) throw new Error(payload.error || "Failed to load finance overview");
      setSummary(payload);
      setOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const moneyRows = (summary?.by_currency ?? []).filter((c) => c.currency !== "COIN");
  const coinRow = (summary?.by_currency ?? []).find((c) => c.currency === "COIN");
  const primary = moneyRows[0] ?? null;
  const trendMax = Math.max(
    1,
    ...(summary?.trends ?? [])
      .filter((t) => t.currency !== "COIN")
      .map((t) => Number(t.verified_payments) || 0),
  );

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Finance overview"
        description="Period collections, commissions, payouts — money and coins kept separate"
        actions={
          <Link
            href="/admin/finance/transactions"
            className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium"
          >
            Open transactions
          </Link>
        }
      />

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
            onClick={() => router.replace(`${pathname}?range=${r.id}`)}
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
              hint="Period activity — confirmed checkouts only"
            />
            <Kpi
              label="Platform commissions & fees"
              value={primary ? money(primary.platform_commission_earned, primary.currency) : "Unavailable"}
              hint="Only amounts recorded on payment rows"
            />
            <Kpi
              label="Provider earnings"
              value={primary ? money(primary.provider_earnings, primary.currency) : "Unavailable"}
              hint="Recipient net where stored at transaction time"
            />
            <Kpi
              label="Completed refunds"
              value={primary ? money(primary.refunds, primary.currency) : "Unavailable"}
            />
            <Kpi
              label="Pending payout requests"
              value={primary ? money(primary.pending_withdrawals, primary.currency) : "Unavailable"}
              hint="Withdrawals + coin redemptions awaiting review"
              href="/admin/finance/payouts?status=pending"
            />
            <Kpi
              label="Recorded completed payouts"
              value={primary ? money(primary.completed_payouts, primary.currency) : "Unavailable"}
              hint="Manually marked paid — not bank execution"
              href="/admin/finance/payouts?status=paid"
            />
          </div>

          {coinRow ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-hint">
                Virtual coins (not money)
              </p>
              <p className="mt-1 text-text-secondary">
                Credits {money(coinRow.coin_credits, "COIN")} · Debits{" "}
                {money(coinRow.coin_debits, "COIN")}
              </p>
            </div>
          ) : null}

          {(summary?.trends?.length ?? 0) > 0 ? (
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-3 font-heading text-sm font-semibold">Collections over time</h2>
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

          <div className="grid gap-3 md:grid-cols-3">
            <QuickLink href="/admin/finance/transactions" title="Transactions" body="Search payments, coins, refunds" />
            <QuickLink href="/admin/finance/payouts" title="Payouts" body="Withdrawals and coin redemptions" />
            <QuickLink href="/admin/wallets" title="Wallets" body="Provider balances and ledgers" />
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

function Kpi({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-hint">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-text-hint">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
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
