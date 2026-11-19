"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { StatusBadge, requestTone } from "@/components/status-badge";
import { adminCacheKey, invalidateAdminCache } from "@/lib/admin-session-cache";
import { adminFetch, patchAdmin } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

type PayoutRow = {
  id: string;
  type: "withdrawal" | "coin_redemption";
  user_id: string;
  amount: number;
  coins?: number;
  etb_per_coin?: number;
  /** Withdrawals: admin Transaction fee taken off, and what the bank gets. */
  fee_percent?: number;
  fee_amount?: number;
  payout_amount?: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  admin_note?: string;
  users?: { id: string; display_name: string; email?: string | null } | null;
  /** Withdrawals only: who asked (gym owner or provider) and their contacts. */
  owner?: {
    email?: string;
    phone?: string;
    gyms?: string;
  } | null;
  /** Withdrawals only: the requester's wallet right now. */
  wallet?: {
    available: number;
    withdrawable: number;
    held: number;
    lifetime_earned: number;
  } | null;
};

type WithdrawalApiRow = {
  id: string;
  user_id: string;
  amount: number;
  fee_percent?: number;
  fee_amount?: number;
  payout_amount?: number;
  status: string;
  created_at: string;
  updated_at: string;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  admin_note?: string;
  owner?: {
    display_name?: string;
    email?: string;
    phone?: string;
    gyms?: string;
  };
  wallet?: PayoutRow["wallet"];
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
    can("withdrawals:write") ||
    can("withdrawals:approve") ||
    can("withdrawals:execute") ||
    can("requests:write");
  const canApproveWithdrawals =
    can("withdrawals:write") ||
    can("withdrawals:approve") ||
    can("requests:write");
  const canPayWithdrawals =
    can("withdrawals:write") ||
    can("withdrawals:execute") ||
    can("requests:write");
  const canResolveCoins = can("coins:write");

  const typeFilter = searchParams.get("type") || "all";
  const statusFilter = searchParams.get("status") || "all";
  const q = searchParams.get("q") || "";

  const [actionError, setError] = useState<string | null>(null);
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

  const {
    data,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<PayoutRow[]>({
    key: adminCacheKey(["finance", "payouts", "list"]),
    fetcher: async () => {
      const client = getSpojexClient();
      const [wRes, cRes] = await Promise.all([
        // Enriched by the API: owner contacts, owned gyms, live wallet balance.
        adminFetch("/api/admin/withdrawals?limit=300").then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as {
            data?: WithdrawalApiRow[];
            error?: string;
          };
          if (!res.ok) throw new Error(body.error || "Failed to load withdrawals");
          return body.data ?? [];
        }),
        client
          .from("coin_redemptions")
          .select("*, users:user_id(id, display_name, email)")
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      if (
        cRes.error &&
        !/does not exist|schema cache/i.test(cRes.error.message)
      )
        throw cRes.error;

      const withdrawals: PayoutRow[] = wRes.map((r) => ({
        id: String(r.id),
        type: "withdrawal" as const,
        user_id: String(r.user_id),
        amount: Number(r.amount || 0),
        fee_percent: Number(r.fee_percent || 0),
        fee_amount: Number(r.fee_amount || 0),
        payout_amount: Number(r.payout_amount ?? r.amount ?? 0),
        currency: "ETB",
        status: String(r.status),
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
        bank_name: r.bank_name || undefined,
        account_name: r.account_name || undefined,
        account_number: r.account_number || undefined,
        admin_note: r.admin_note || undefined,
        users: {
          id: String(r.user_id),
          display_name: r.owner?.display_name || "",
          email: r.owner?.email || null,
        },
        owner: r.owner ?? null,
        wallet: r.wallet ?? null,
      }));
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
      return [...withdrawals, ...redemptions].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
    },
  });
  const rows = data ?? [];
  const error = actionError ?? loadError;
  const ok = data != null;

  const load = useCallback(async () => {
    setError(null);
    await refresh();
  }, [refresh]);

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
    const send =
      row.type === "withdrawal" && row.payout_amount != null
        ? `Send ${money(row.payout_amount)} to the bank (after the ${money(row.fee_amount ?? 0)} fee). `
        : "";
    const ref = window.prompt(
      `${send}Transfer reference (required). Marking paid records an external transfer - it does not send money.`,
    );
    if (!ref?.trim()) return;
    setBusyId(row.id);
    setError(null);
    try {
      if (row.type === "withdrawal") {
        await patchAdmin(`/api/admin/withdrawals/${row.id}`, {
          action: "paid",
          admin_note: `Transfer ref: ${ref.trim()}`,
        });
      } else {
        await patchAdmin(`/api/admin/coin-redemptions/${row.id}`, {
          action: "paid",
          admin_note: `Transfer ref: ${ref.trim()}`,
        });
      }
      invalidateAdminCache("finance");
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
          action: "reject",
          admin_note: reason.trim(),
        });
      } else {
        await patchAdmin(`/api/admin/coin-redemptions/${row.id}`, {
          action: "rejected",
          admin_note: reason.trim(),
        });
      }
      invalidateAdminCache("finance");
      await load();
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  /** Withdrawals only: review step before the bank transfer. */
  const approve = async (row: PayoutRow) => {
    if (row.type !== "withdrawal" || !canApproveWithdrawals) return;
    if (
      !window.confirm(
        `Approve ${money(row.amount)} for ${row.users?.display_name || "this user"}? The amount stays held until you mark it paid.`,
      )
    )
      return;
    setBusyId(row.id);
    setError(null);
    try {
      await patchAdmin(`/api/admin/withdrawals/${row.id}`, {
        action: "approve",
      });
      invalidateAdminCache("finance");
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
        description="Withdrawals & redemptions"
        actions={
          <AdminReloadButton
            loading={loading}
            refreshing={refreshing}
            onClick={() => void load()}
          />
        }
      />

      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-text-secondary">
        Withdrawals: approve the request, transfer the money, then “Record as
        paid” with the transfer reference. Recording does not send money. The
        amount stays held from the wallet until paid; rejecting returns it.
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
            <option value="approved">Approved</option>
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
                        {row.owner?.gyms ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-text-secondary">
                            Gym owner
                          </span>
                        ) : null}
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
                      {row.fee_amount ? (
                        <p className="text-[10px] text-text-hint">
                          Send {money(row.payout_amount ?? row.amount)}
                        </p>
                      ) : null}
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
              {selected.owner?.email ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-hint">Email</dt>
                  <dd className="break-all text-right">
                    {selected.owner.email}
                  </dd>
                </div>
              ) : null}
              {selected.owner?.phone ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-hint">Phone</dt>
                  <dd>{selected.owner.phone}</dd>
                </div>
              ) : null}
              {selected.owner?.gyms ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-hint">Gyms owned</dt>
                  <dd className="text-right">{selected.owner.gyms}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-text-hint">Status</dt>
                <dd>
                  <StatusBadge tone={requestTone(selected.status)}>
                    {selected.status}
                  </StatusBadge>
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
              {selected.type === "withdrawal" ? (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-hint">
                      Chapa fee ({Number(selected.fee_percent || 0)}%)
                    </dt>
                    <dd>− {money(selected.fee_amount ?? 0)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-hint">Send to bank</dt>
                    <dd className="font-semibold">
                      {money(selected.payout_amount ?? selected.amount)}
                    </dd>
                  </div>
                </>
              ) : null}
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
              {selected.account_name ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-hint">Account name</dt>
                  <dd>{selected.account_name}</dd>
                </div>
              ) : null}
              {selected.wallet ? (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-hint">Wallet balance</dt>
                    <dd>{money(selected.wallet.available)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-hint">Withdrawable now</dt>
                    <dd>{money(selected.wallet.withdrawable)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-hint">Held for payouts</dt>
                    <dd>{money(selected.wallet.held)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-hint">Lifetime earned</dt>
                    <dd>{money(selected.wallet.lifetime_earned)}</dd>
                  </div>
                </>
              ) : null}
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

            {(() => {
              const isWithdrawal = selected.type === "withdrawal";
              // Withdrawals: pending → approved → paid. Coins: pending → paid.
              const showApprove =
                isWithdrawal &&
                selected.status === "pending" &&
                canApproveWithdrawals;
              const showPaid = isWithdrawal
                ? selected.status === "approved" && canPayWithdrawals
                : selected.status === "pending" && canResolveCoins;
              const showReject = isWithdrawal
                ? (selected.status === "pending" ||
                    selected.status === "approved") &&
                  canApproveWithdrawals
                : selected.status === "pending" && canResolveCoins;
              if (!showApprove && !showPaid && !showReject) return null;
              return (
                <div className="mt-5 flex flex-wrap gap-2">
                  {showApprove ? (
                    <button
                      type="button"
                      disabled={busyId === selected.id}
                      onClick={() => void approve(selected)}
                      className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      Approve
                    </button>
                  ) : null}
                  {showPaid ? (
                    <button
                      type="button"
                      disabled={busyId === selected.id}
                      onClick={() => void markPaid(selected)}
                      className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      Record as paid
                    </button>
                  ) : null}
                  {showReject ? (
                    <button
                      type="button"
                      disabled={busyId === selected.id}
                      onClick={() => void reject(selected)}
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  ) : null}
                </div>
              );
            })()}

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
