"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminSearchInput,
  AdminTableShell,
} from "@/components/admin-layout";
import type { WalletRow } from "@/lib/types";
import { formatDate, formatStatusLabel } from "@/lib/utils";

function money(amount: number | null | undefined, currency = "ETB") {
  const value = Number(amount ?? 0);
  return `${currency} ${value.toLocaleString("en-ET", { maximumFractionDigits: 2 })}`;
}

export default function WalletsPage() {
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/admin/wallets", { credentials: "same-origin" })
      .then(async (response) => {
        const payload = (await response.json()) as { data?: WalletRow[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Failed to load wallets");
        setRows(payload.data ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.users?.display_name, row.users?.full_name, row.users?.role, row.user_id].some((value) =>
        String(value ?? "").toLowerCase().includes(q),
      ),
    );
  }, [query, rows]);

  return (
    <>
      <AdminPageHeader
        title="Wallets & Ledgers"
        description="Provider ETB wallet ownership and purpose. Open a wallet for chronological ledger — available may exceed lifetime earned when adjustments exist. Coin wallets live under Coins & Gifts activity in Transactions."
        breadcrumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Wallets & Ledgers" }]}
      />
      <AdminFilterPanel>
        <AdminSearchInput value={query} onChange={setQuery} placeholder="Search provider" />
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading wallets…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title="No wallets yet"
            description="A wallet appears after a provider completes a paid booking."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Provider</th>
                  <th className="px-4 py-3 font-semibold">Available</th>
                  <th className="px-4 py-3 font-semibold">Lifetime earned</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.user_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/finance/wallets/${row.user_id}`} className="font-medium text-primary">
                        {row.users?.display_name || row.users?.full_name || row.user_id.slice(0, 8)}
                      </Link>
                      <p className="text-xs text-text-secondary">
                        {formatStatusLabel(row.users?.role)}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-semibold">{money(row.available, row.currency)}</td>
                    <td className="px-4 py-3">{money(row.lifetime_earned, row.currency)}</td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>
    </>
  );
}
