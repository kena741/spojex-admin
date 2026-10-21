"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { formatDateTime, formatStatusLabel } from "@/lib/utils";

type LedgerRow = {
  id: string;
  amount: number;
  is_credit: boolean;
  kind: string;
  note: string;
  created_at: string;
  payment_id?: string | null;
  withdrawal_id?: string | null;
  tx_ref?: string;
};

type Payload = {
  wallet?: {
    user_id: string;
    available: number;
    lifetime_earned: number;
    currency: string;
    updated_at: string;
  };
  user?: { id: string; display_name: string; email?: string | null; role?: string } | null;
  reserved_pending_withdrawals?: number;
  ledger?: LedgerRow[];
  withdrawals?: { id: string; amount: number; status: string; created_at: string }[];
  notes?: string[];
  definitions?: Record<string, string>;
  error?: string;
};

function money(amount: number | null | undefined, currency = "ETB") {
  return `${currency} ${Number(amount ?? 0).toLocaleString("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function WalletDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/wallets/${userId}`, { cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json()) as Payload;
        if (!res.ok) throw new Error(payload.error || "Failed to load wallet");
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <AdminLoadingRow label="Loading wallet…" />;
  if (error || !data?.wallet) {
    return (
      <div className="space-y-3">
        <AdminErrorAlert message={error || "Wallet not found"} />
        <Link href="/admin/wallets" className="text-sm text-primary hover:underline">
          Back to wallets
        </Link>
      </div>
    );
  }

  const wallet = data.wallet;
  const currency = wallet.currency || "ETB";

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={data.user?.display_name || "Provider wallet"}
        description={data.user?.email || userId}
        backHref="/admin/wallets"
        breadcrumbs={[
          { label: "Finance", href: "/admin/finance" },
          { label: "Wallets", href: "/admin/wallets" },
          { label: data.user?.display_name || "Detail" },
        ]}
        actions={
          <Link
            href={`/admin/people/${userId}`}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium"
          >
            Open person profile
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Available" value={money(wallet.available, currency)} />
        <Metric
          label="Reserved (pending withdrawals)"
          value={money(data.reserved_pending_withdrawals ?? 0, currency)}
        />
        <Metric label="Lifetime earned" value={money(wallet.lifetime_earned, currency)} />
        <Metric label="Account type" value={formatStatusLabel(data.user?.role) || "Provider"} />
      </div>

      {(data.notes?.length ?? 0) > 0 ? (
        <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {data.notes!.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 font-heading text-sm font-semibold">Ledger</h2>
        {(data.ledger?.length ?? 0) === 0 ? (
          <p className="text-sm text-text-hint">No ledger entries yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.ledger!.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{row.kind}</p>
                  <p className="truncate text-xs text-text-secondary">{row.note || "—"}</p>
                  <p className="text-[11px] text-text-hint">{formatDateTime(row.created_at)}</p>
                  {row.payment_id ? (
                    <Link
                      href={`/admin/finance/transactions?id=${encodeURIComponent(`service_payment:${row.payment_id}`)}`}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Related payment
                    </Link>
                  ) : null}
                </div>
                <p
                  className={`shrink-0 font-semibold tabular-nums ${
                    row.is_credit ? "text-emerald-700" : "text-foreground"
                  }`}
                >
                  {row.is_credit ? "+" : "−"}
                  {money(row.amount, currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 font-heading text-sm font-semibold">Withdrawal requests</h2>
        {(data.withdrawals?.length ?? 0) === 0 ? (
          <p className="text-sm text-text-hint">No withdrawals.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.withdrawals!.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2">
                <Link
                  href={`/admin/finance/payouts?type=withdrawal&q=${w.id}`}
                  className="text-primary hover:underline"
                >
                  {money(w.amount, currency)}
                </Link>
                <StatusBadge tone={requestTone(w.status)}>{w.status}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-hint">{label}</p>
      <p className="mt-1 font-heading text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
