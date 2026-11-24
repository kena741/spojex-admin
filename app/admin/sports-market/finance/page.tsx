"use client";

import { useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminReloadButton,
  AdminSelect,
  AdminStatCard,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { OrderDetailModal, SettleCommissionModal, SmTabs, buttonClass, smGet } from "@/components/sports-market/shared";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { commissionTone, etb, labelize, shortDate, type SmOrder, type SmPayment } from "@/lib/sports-market";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";

function paymentTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "refunded") return "info" as const;
  return "warning" as const;
}

export default function SportsMarketFinancePage() {
  const [view, setView] = useState<"payments" | "commission">("commission");
  return (
    <div>
      <AdminPageHeader
        title="Sports Marketplace"
        description="Payments from buyers and the 10% commission on product subtotals (delivery fees are never charged commission)."
      />
      <SmTabs />
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className={view === "commission" ? `${buttonClass} border-primary text-primary` : buttonClass}
          onClick={() => setView("commission")}
        >
          Commission
        </button>
        <button
          type="button"
          className={view === "payments" ? `${buttonClass} border-primary text-primary` : buttonClass}
          onClick={() => setView("payments")}
        >
          Payments
        </button>
      </div>
      {view === "commission" ? <CommissionView /> : <PaymentsView />}
    </div>
  );
}

function CommissionView() {
  const { can } = useAdminPermissions();
  const canSettle = can("sports_market:finance");
  const [status, setStatus] = useState("pending_settlement");
  const params = new URLSearchParams({ limit: "200" });
  if (status) params.set("commission_status", status);
  const { data, loading, refreshing, error, refresh } = useAdminQuery<SmOrder[]>({
    key: adminCacheKey(["sports-market", "commission", status]),
    fetcher: async () => (await smGet<{ orders: SmOrder[] }>(`/orders?${params}`)).orders,
  });
  const orders = data ?? [];
  const total = orders.reduce((sum, o) => sum + (o.commission_amount ?? 0), 0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [settling, setSettling] = useState<SmOrder | null>(null);

  return (
    <>
      <AdminFilterPanel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <AdminSelect value={status} onChange={setStatus}>
            <option value="pending_settlement">Cash orders waiting to settle</option>
            <option value="pending">Pending (order not completed)</option>
            <option value="earned">Earned (online, kept at payout)</option>
            <option value="settled">Settled</option>
            <option value="void">Void (cancelled / returned)</option>
            <option value="">All</option>
          </AdminSelect>
          <div className="flex-1" />
          <AdminReloadButton onClick={refresh} refreshing={refreshing} />
        </div>
      </AdminFilterPanel>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <AdminStatCard title="Orders" value={String(orders.length)} />
        <AdminStatCard title="Commission in this list" value={etb(total)} />
      </div>
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {loading && !data ? <AdminLoadingRow label="Loading commission…" /> : null}
        {!loading && orders.length === 0 && !error ? <AdminEmpty title="Nothing here" description="No orders with this commission status." /> : null}
        {orders.length ? (
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Seller</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
                <th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3 text-right">Seller payout</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <button type="button" className="font-medium text-text-primary hover:underline" onClick={() => setOpenId(o.id)}>
                      {o.order_no}
                    </button>
                    <p className="text-xs text-text-secondary">
                      {o.payment_method === "cod" ? "Cash" : labelize(o.payment_method)} · {shortDate(o.completed_at ?? o.created_at)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {o.seller.id ? (
                      <Link
                        href={`/admin/people/${o.seller.id}`}
                        className="text-primary hover:underline"
                      >
                        {o.seller.name}
                      </Link>
                    ) : (
                      <span className="text-text-primary">{o.seller.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{etb(o.subtotal, o.currency)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {etb(o.commission_amount, o.currency)}
                    <span className="text-text-hint"> ({o.commission_rate ?? 0}%)</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{etb(o.seller_payout, o.currency)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={commissionTone(o.commission_status)}>{labelize(o.commission_status)}</StatusBadge>
                    {o.commission_note ? <p className="mt-1 max-w-[220px] truncate text-xs text-text-hint">{o.commission_note}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canSettle && o.commission_status === "pending_settlement" ? (
                      <button type="button" className={buttonClass} onClick={() => setSettling(o)}>
                        Settle
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </AdminTableShell>
      <OrderDetailModal orderId={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
      <SettleCommissionModal open={!!settling} order={settling} onClose={() => setSettling(null)} onDone={() => refresh()} />
    </>
  );
}

function PaymentsView() {
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const params = new URLSearchParams({ limit: "200" });
  if (status) params.set("status", status);
  if (method) params.set("method", method);
  const { data, loading, refreshing, error, refresh } = useAdminQuery<SmPayment[]>({
    key: adminCacheKey(["sports-market", "payments", status, method]),
    fetcher: async () => (await smGet<{ payments: SmPayment[] }>(`/payments?${params}`)).payments,
  });
  const payments = data ?? [];
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <AdminFilterPanel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <AdminSelect value={status} onChange={setStatus}>
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </AdminSelect>
          <AdminSelect value={method} onChange={setMethod}>
            <option value="">Any method</option>
            <option value="chapa">Chapa</option>
            <option value="wallet">Wallet</option>
            <option value="cod">Cash on delivery</option>
          </AdminSelect>
          <div className="flex-1" />
          <AdminReloadButton onClick={refresh} refreshing={refreshing} />
        </div>
      </AdminFilterPanel>
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {loading && !data ? <AdminLoadingRow label="Loading payments…" /> : null}
        {!loading && payments.length === 0 && !error ? <AdminEmpty title="No payments" description="Nothing matches these filters." /> : null}
        {payments.length ? (
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Buyer → Seller</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <button type="button" className="font-medium text-text-primary hover:underline" onClick={() => setOpenId(p.order_id)}>
                      {p.order_no}
                    </button>
                    <p className="text-xs text-text-secondary">{shortDate(p.paid_at ?? p.created_at)}</p>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {p.buyer_name} → {p.seller_name}
                  </td>
                  <td className="px-4 py-3">{p.method === "cod" ? "Cash on delivery" : labelize(p.method)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {etb(p.amount, p.currency)}
                    <p className="text-xs text-text-hint">
                      {etb(p.subtotal, p.currency)} + {etb(p.delivery_fee, p.currency)} delivery
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block max-w-[200px] truncate font-mono text-xs text-text-secondary">{p.provider_ref || "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={paymentTone(p.status)}>{labelize(p.status)}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </AdminTableShell>
      <OrderDetailModal orderId={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
    </>
  );
}
