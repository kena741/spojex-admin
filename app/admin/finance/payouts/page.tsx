"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminSearchInput,
  AdminSelect,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { patchAdmin } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

type PayoutRow = {
  id: string;
  type: "withdrawal" | "coin_redemption";
  user_id: string;
  amount: number;
  coins?: number;
  etb_per_coin?: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
  bank_name?: string;
  account_number?: string;
  admin_note?: string;
  users?: { id: string; display_name: string; email?: string | null } | null;
};

function money(amount: number, currency = "ETB") {
  return `${currency} ${Number(amount || 0).toLocaleString("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function maskAccount(value?: string | null) {
  if (!value) return "-";
  const s = String(value);
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}

function ageLabel(createdAt: string) {
  const h = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 36e5);
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export default function FinancePayoutsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canResolveWithdrawals =
    can("withdrawals:write") || can("requests:write");
  const canResolveCoins = can("coins:write");

  const typeFilter = searchParams.get("type") || "all";
  const statusFilter = searchParams.get("status") || "all";
  const q = searchParams.get("q") || "";

  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PayoutRow | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOk(false);
    try {
      const client = getSpojexClient();
      const [wRes, cRes] = await Promise.all([
        client
          .from("withdrawal_requests")
          .select("*, users:user_id(id, display_name, email)")
          .order("created_at", { ascending: false })
          .limit(300),
        client
          .from("coin_redemptions")
          .select("*, users:user_id(id, display_name, email)")
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      if (wRes.error) throw wRes.error;
      if (
        cRes.error &&
        !/does not exist|schema cache/i.test(cRes.error.message)
      )
        throw cRes.error;

      const withdrawals: PayoutRow[] = (wRes.data ?? []).map(
        (r: Record<string, unknown>) => ({
          id: String(r.id),
          type: "withdrawal" as const,
          user_id: String(r.user_id),
          amount: Number(r.amount || 0),
          currency: "ETB",
          status: String(r.status),
          created_at: String(r.created_at),
          updated_at: String(r.updated_at),
          bank_name: r.bank_name ? String(r.bank_name) : undefined,
          account_number: r.account_number
            ? String(r.account_number)
            : undefined,
          admin_note: r.admin_note ? String(r.admin_note) : undefined,
          users: (r.users as PayoutRow["users"]) ?? null,
        }),
      );
      const redemptions: PayoutRow[] = (cRes.data ?? []).map(
        (r: Record<string, unknown>) => ({
          id: String(r.id),
          type: "coin_redemption" as const,
          user_id: String(r.user_id),
          amount: Number(r.etb_amount || 0),
          coins: Number(r.coins || 0),
          etb_per_coin: Number(r.etb_per_coin || 0),
          currency: "ETB",
          status: String(r.status),
          created_at: String(r.created_at),
          updated_at: String(r.updated_at),
          bank_name: r.bank_name ? String(r.bank_name) : undefined,
          account_number: r.account_number
            ? String(r.account_number)
            : undefined,
          admin_note: r.admin_note ? String(r.admin_note) : undefined,
          users: (r.users as PayoutRow["users"]) ?? null,
        }),
      );
      setRows(
        [...withdrawals, ...redemptions].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        ),
      );
      setOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payouts");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter !== "all" && row.type !== typeFilter) return false;
      if (statusFilter !== "all" && row.status.toLowerCase() !== statusFilter)
        return false;
      if (!query) return true;
      return [row.users?.display_name, row.users?.email, row.id, row.bank_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(query));
    });
  }, [q, rows, statusFilter, typeFilter]);

  const markPaid = async (row: PayoutRow) => {
    const canAct =
      row.type === "withdrawal" ? canResolveWithdrawals : canResolveCoins;
    if (!canAct) return;
    const ref = window.prompt(
      "Transfer reference (required). Marking paid records an external transfer - it does not send money.",
    );
    if (!ref?.trim()) return;
    setBusyId(row.id);
    setError(null);
    try {
      if (row.type === "withdrawal") {
        await patchAdmin(`/api/admin/withdrawals/${row.id}`, {
          status: "paid",
          admin_note: `Transfer ref: ${ref.trim()}`,
        });
      } else {
        await patchAdmin(`/api/admin/coin-redemptions/${row.id}`, {
          status: "paid",
          admin_note: `Transfer ref: ${ref.trim()}`,
        });
      }
      await load();
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (row: PayoutRow) => {
    const canAct =
      row.type === "withdrawal" ? canResolveWithdrawals : canResolveCoins;
    if (!canAct) return;
    const reason = window.prompt("Rejection reason (required):");
    if (!reason?.trim()) return;
    setBusyId(row.id);
    setError(null);
    try {
      if (row.type === "withdrawal") {
        await patchAdmin(`/api/admin/withdrawals/${row.id}`, {
          status: "rejected",
          admin_note: reason.trim(),
        });
      } else {
        await patchAdmin(`/api/admin/coin-redemptions/${row.id}`, {
          status: "rejected",
          admin_note: reason.trim(),
        });
      }
      await load();
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Payouts"
        description="Provider money withdrawals and creator coin redemptions - manually recorded transfers"
      />

      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-text-secondary">
        “Mark paid” confirms you already transferred funds outside Spojex. It
        does not execute a bank transfer.
      </p>

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

      <AdminFilterPanel>
        <div className="grid gap-2 md:grid-cols-[1fr_160px_140px]">
          <AdminSearchInput
            value={q}
            onChange={(value) => writeParams({ q: value || null })}
            placeholder="Search requester, bank, id…"
          />
          <AdminSelect
            value={typeFilter}
            onChange={(value) =>
              writeParams({ type: value === "all" ? null : value })
            }
          >
            <option value="all">All request types</option>
            <option value="withdrawal">Provider withdrawals</option>
            <option value="coin_redemption">Coin redemptions</option>
          </AdminSelect>
          <AdminSelect
            value={statusFilter}
            onChange={(value) =>
              writeParams({ status: value === "all" ? null : value })
            }
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>

      {!loading && ok && filtered.length === 0 && !error ? (
        <AdminEmpty
          title="No payout requests"
          description="Nothing matches these filters."
        />
      ) : null}

      {loading || filtered.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {loading ? (
            <AdminLoadingRow
              label="Loading payouts…"
              compact
              className="py-10"
            />
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((row) => (
                <li key={`${row.type}-${row.id}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40",
                      selected?.id === row.id &&
                        selected.type === row.type &&
                        "bg-secondary/50",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {row.users?.display_name || row.user_id.slice(0, 8)}
                        </p>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">
                          {row.type === "withdrawal"
                            ? "Withdrawal"
                            : "Coin redemption"}
                        </span>
                      </div>
                      <p className="truncate text-xs text-text-secondary">
                        {row.bank_name || "Bank"} ·{" "}
                        {maskAccount(row.account_number)} ·{" "}
                        {ageLabel(row.created_at)} old
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {money(row.amount)}
                      </p>
                      {row.coins != null ? (
                        <p className="text-[10px] text-text-hint">
                          {row.coins} coins @ {row.etb_per_coin}/coin
                        </p>
                      ) : null}
                      <StatusBadge tone={requestTone(row.status)}>
                        {row.status}
                      </StatusBadge>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          onClick={() => setSelected(null)}
        >
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-sm font-semibold">
              Payout request
            </h3>
            <p className="mt-1 text-xs text-text-hint font-mono break-all">
              {selected.id}
            </p>
            <dl className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-text-hint">Requester</dt>
                <dd>
                  <Link
                    href={`/admin/people/${selected.user_id}`}
                    className="text-primary hover:underline"
                  >
                    {selected.users?.display_name ||
                      selected.user_id.slice(0, 8)}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-hint">Type</dt>
                <dd>
                  {selected.type === "withdrawal"
                    ? "Provider withdrawal"
                    : "Coin redemption"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-hint">Amount</dt>
                <dd className="font-semibold">{money(selected.amount)}</dd>
              </div>
              {selected.coins != null ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-hint">Conversion snapshot</dt>
                  <dd>
                    {selected.coins} coins × {selected.etb_per_coin} ETB
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-text-hint">Destination</dt>
                <dd>
                  {selected.bank_name} {maskAccount(selected.account_number)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-hint">Requested</dt>
                <dd>{formatDateTime(selected.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-hint">Updated</dt>
                <dd>{formatDate(selected.updated_at)}</dd>
              </div>
              {selected.admin_note ? (
                <div>
                  <dt className="text-text-hint">Admin note</dt>
                  <dd className="mt-1">{selected.admin_note}</dd>
                </div>
              ) : null}
            </dl>

            {selected.status === "pending" ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === selected.id}
                  onClick={() => void markPaid(selected)}
                  className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  Record as paid
                </button>
                <button
                  type="button"
                  disabled={busyId === selected.id}
                  onClick={() => void reject(selected)}
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            ) : null}

            <Link
              href={`/admin/finance/transactions?q=${encodeURIComponent(selected.id)}`}
              className="mt-4 inline-flex text-xs font-medium text-primary hover:underline"
            >
              Find related transactions
            </Link>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
