"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { adminFetch } from "@/lib/hooks";
import { formatDate, formatStatusLabel } from "@/lib/utils";

type CoinRedemptionRow = {
  id: string;
  user_id: string;
  coins: number;
  etb_amount?: number;
  etb_per_coin?: number;
  status: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  admin_note: string;
  created_at: string;
  users?: { display_name?: string | null; email?: string | null } | null;
};

const statuses = ["pending", "paid", "rejected"];

export default function CoinRedemptionsPage() {
  const [rows, setRows] = useState<CoinRedemptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const response = await adminFetch("/api/admin/coin-redemptions");
    const payload = (await response.json()) as {
      data?: CoinRedemptionRow[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load");
    setRows(payload.data ?? []);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return [
        row.users?.display_name,
        row.users?.email,
        row.bank_name,
        row.account_name,
        row.account_number,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [query, rows, status]);

  const resolve = async (id: string, action: "paid" | "rejected") => {
    setBusyId(id);
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/coin-redemptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Update failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Coin redemptions"
        description="Payout requests for redeemable coins received as gifts"
        actions={
          <Link
            href="/admin/coin-catalog"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Redeem limits &amp; rate
          </Link>
        }
      />
      <AdminFilterPanel>
        <AdminSearchInput value={query} onChange={setQuery} placeholder="Search" />
        <AdminSelect value={status} onChange={setStatus}>
          <option value="all">All statuses</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {formatStatusLabel(item)}
            </option>
          ))}
        </AdminSelect>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading redemptions…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title="No coin redemptions"
            description="When creators redeem received coins, requests appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Coins</th>
                  <th className="px-4 py-3 font-semibold">Payout ETB</th>
                  <th className="px-4 py-3 font-semibold">Bank</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Requested</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {row.users?.display_name || "User"}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {row.users?.email || row.user_id}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {row.coins.toLocaleString()}
                      {row.etb_per_coin != null && row.etb_per_coin > 0 ? (
                        <div className="text-xs font-normal text-text-secondary">
                          @ {Number(row.etb_per_coin).toFixed(2)} ETB/coin
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {row.etb_amount != null
                        ? Number(row.etb_amount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      <div>{row.bank_name}</div>
                      <div className="text-xs">
                        {row.account_name} · {row.account_number}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone(row.status)}>
                        {formatStatusLabel(row.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === "pending" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void resolve(row.id, "paid")}
                            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                          >
                            Mark paid
                          </button>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void resolve(row.id, "rejected")}
                            className="rounded-md border border-border px-2.5 py-1.5 text-xs disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </td>
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
