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
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { patchAdmin } from "@/lib/hooks";
import type { WithdrawalRow } from "@/lib/types";
import { formatDate, formatStatusLabel } from "@/lib/utils";

function money(amount: number | null | undefined) {
  const value = Number(amount ?? 0);
  return `ETB ${value.toLocaleString("en-ET", { maximumFractionDigits: 2 })}`;
}

const statuses = ["pending", "paid", "rejected"];

export default function WithdrawalsPage() {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/admin/withdrawals", { credentials: "same-origin" });
    const payload = (await response.json()) as { data?: WithdrawalRow[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Failed to load withdrawals");
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
        row.users?.full_name,
        row.bank_name,
        row.account_name,
        row.account_number,
      ].some((value) => String(value ?? "").toLowerCase().includes(q));
    });
  }, [query, rows, status]);

  const resolve = async (id: string, action: "paid" | "reject") => {
    setBusyId(id);
    try {
      await patchAdmin(`/api/admin/withdrawals/${id}`, { action });
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
        title="Withdrawals"
        description="Mark paid after you send the bank transfer. Reject returns the amount to the provider wallet."
      />
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search provider or bank" />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {formatStatusLabel(item)}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading withdrawals…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title="No withdrawals"
            description="Providers request payouts from the app wallet after they earn from completed bookings."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Provider</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Bank</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Requested</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${row.user_id}`} className="text-primary">
                        {row.users?.display_name || row.users?.full_name || row.user_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-semibold">{money(row.amount)}</td>
                    <td className="px-4 py-3">
                      <p>{row.bank_name}</p>
                      <p className="text-xs text-text-secondary">
                        {row.account_name} · {row.account_number}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone(row.status)}>{formatStatusLabel(row.status)}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-3">
                      {row.status === "pending" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            className="text-sm font-medium text-primary disabled:opacity-50"
                            onClick={() => resolve(row.id, "paid")}
                          >
                            Mark paid
                          </button>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            className="text-sm font-medium text-red-600 disabled:opacity-50"
                            onClick={() => resolve(row.id, "reject")}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
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
