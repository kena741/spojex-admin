"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminReloadButton,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { OrderDetailModal, SmTabs, smGet } from "@/components/sports-market/shared";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { ORDER_STATUSES, commissionTone, etb, labelize, orderTone, shortDate, type SmOrder } from "@/lib/sports-market";
import { useAdminQuery } from "@/lib/use-admin-query";

const GROUPS: Record<string, string> = {
  open: "placed,payment_pending,payment_confirmed,accepted,processing,ready_for_dispatch,out_for_delivery,delivered",
  problems: "cancelled,rejected,returned",
};

export default function SportsMarketOrdersPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams({ limit: "200" });
  if (debounced) params.set("q", debounced);
  if (status) params.set("status", GROUPS[status] ?? status);
  if (method) params.set("payment_method", method);
  const { data, loading, refreshing, error, refresh } = useAdminQuery<SmOrder[]>({
    key: adminCacheKey(["sports-market", "orders", debounced, status, method]),
    fetcher: async () => (await smGet<{ orders: SmOrder[] }>(`/orders?${params}`)).orders,
  });
  const orders = data ?? [];
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <AdminPageHeader
        title="Sports Marketplace"
        description="Every marketplace order, with its payment, commission and full status history."
        actions={<AdminReloadButton onClick={refresh} refreshing={refreshing} />}
      />
      <SmTabs />
      <AdminFilterPanel>
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="flex-1">
            <AdminSearchInput value={q} onChange={setQ} placeholder="Search by order number, product, buyer or seller" />
          </div>
          <AdminSelect value={status} onChange={setStatus}>
            <option value="">All statuses</option>
            <option value="open">Open orders</option>
            <option value="problems">Cancelled, rejected, returned</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {labelize(s)}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={method} onChange={setMethod}>
            <option value="">Any payment</option>
            <option value="chapa">Chapa</option>
            <option value="wallet">Wallet</option>
            <option value="cod">Cash on delivery</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {loading && !data ? <AdminLoadingRow label="Loading orders…" /> : null}
        {!loading && orders.length === 0 && !error ? <AdminEmpty title="No orders" description="Nothing matches these filters." /> : null}
        {orders.length ? (
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Buyer → Seller</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                  onClick={() => setOpenId(o.id)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-text-primary">{o.order_no}</p>
                    <p className="text-xs text-text-secondary">{shortDate(o.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="truncate text-text-primary">{o.product.name}</p>
                    <p className="text-xs text-text-secondary">× {o.quantity}</p>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {o.buyer.id ? (
                      <Link
                        href={`/admin/people/${o.buyer.id}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {o.buyer.name}
                      </Link>
                    ) : (
                      o.buyer.name
                    )}
                    {" → "}
                    {o.seller.id ? (
                      <Link
                        href={`/admin/people/${o.seller.id}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {o.seller.name}
                      </Link>
                    ) : (
                      o.seller.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{etb(o.total, o.currency)}</td>
                  <td className="px-4 py-3">
                    <p className="text-text-primary">{o.payment_method === "cod" ? "Cash" : labelize(o.payment_method)}</p>
                    <p className="text-xs text-text-secondary">{labelize(o.payment_status)}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="tabular-nums">{etb(o.commission_amount, o.currency)}</p>
                    <StatusBadge tone={commissionTone(o.commission_status)}>{labelize(o.commission_status)}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={orderTone(o.status)}>{o.status_label || labelize(o.status)}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </AdminTableShell>
      <OrderDetailModal orderId={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
    </div>
  );
}
