"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminErrorAlert, AdminLoadingRow, AdminModal, AdminModalFooter } from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { adminFetch, postAdmin } from "@/lib/hooks";
import {
  SM_API,
  commissionTone,
  etb,
  labelize,
  orderTone,
  shortDate,
  type SmOrder,
} from "@/lib/sports-market";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn } from "@/lib/utils";

export const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60";
export const labelClass = "mb-1.5 block text-sm font-medium text-foreground";
export const buttonClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50";
export const primaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50";

/** GET through the admin proxy; unwraps `{data}` and throws the backend message. */
export async function smGet<T>(path: string): Promise<T> {
  const res = await adminFetch(`${SM_API}${path}`);
  const payload = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw new Error(payload.error || "Could not load the marketplace");
  return payload.data as T;
}

export function smPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return postAdmin(`${SM_API}${path}`, body) as Promise<T>;
}

const TABS = [
  { href: "/admin/sports-market", label: "Overview" },
  { href: "/admin/sports-market/sellers", label: "Sellers" },
  { href: "/admin/sports-market/listings", label: "Listings" },
  { href: "/admin/sports-market/reports", label: "Reports" },
  { href: "/admin/sports-market/orders", label: "Orders" },
  { href: "/admin/sports-market/finance", label: "Payments & commission" },
  { href: "/admin/sports-market/categories", label: "Categories" },
];

export function SmTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1 sm:mb-6">
      {TABS.map((t) => {
        const active = t.href === "/admin/sports-market" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
              active ? "bg-primary text-primary-foreground" : "text-text-secondary hover:bg-muted hover:text-text-primary",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Ask for a reason (or note) before a change that needs one. */
export function ReasonModal({
  open,
  title,
  label = "Reason",
  required = true,
  saveLabel = "Confirm",
  extra,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label?: string;
  required?: boolean;
  saveLabel?: string;
  extra?: React.ReactNode;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };
  return (
    <AdminModal
      open={open}
      title={title}
      onClose={onClose}
      stacked
      footer={
        <AdminModalFooter
          onCancel={onClose}
          onSave={save}
          saving={saving}
          disabled={required && reason.trim().length < 3}
          saveLabel={saveLabel}
        />
      }
    >
      <div className="space-y-3">
        {error ? <AdminErrorAlert message={error} /> : null}
        {extra}
        <div>
          <label className={labelClass}>{label}</label>
          <textarea
            className={`${fieldClass} h-24 py-2`}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
    </AdminModal>
  );
}

const NEEDS_REASON = new Set(["cancelled", "rejected", "returned"]);

/** Full order: money split, delivery, payment, timeline, history, and admin actions. */
export function OrderDetailModal({
  orderId,
  onClose,
  onChanged,
}: {
  orderId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useAdminPermissions();
  const [order, setOrder] = useState<SmOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [settle, setSettle] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    setOrder(null);
    setError(null);
    smGet<SmOrder>(`/orders/${orderId}`).then(setOrder).catch((e: Error) => setError(e.message));
  }, [orderId]);

  const move = async (status: string, reason = "") => {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const next = await smPost<SmOrder>(`/orders/${order.id}/status`, {
        status,
        reason,
        cash_collected: status === "delivered" && order.payment_method === "cod",
      });
      setOrder(next);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the order");
    } finally {
      setBusy(false);
    }
  };

  const o = order;
  return (
    <AdminModal open={!!orderId} title={o ? `Order ${o.order_no}` : "Order"} onClose={onClose} className="max-w-2xl">
      {error ? <AdminErrorAlert message={error} /> : null}
      {!o && !error ? <AdminLoadingRow label="Loading order…" compact /> : null}
      {o ? (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={orderTone(o.status)}>{o.status_label}</StatusBadge>
            <StatusBadge tone="neutral">{labelize(o.payment_method)}</StatusBadge>
            <StatusBadge tone={o.payment_status === "paid" ? "success" : o.payment_status === "refunded" ? "danger" : "warning"}>
              Payment {o.payment_status}
            </StatusBadge>
            {o.commission_status ? (
              <StatusBadge tone={commissionTone(o.commission_status)}>Commission {labelize(o.commission_status)}</StatusBadge>
            ) : null}
          </div>

          <div className="flex gap-3">
            {o.product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.product.image} alt="" className="h-16 w-16 rounded-lg object-cover" />
            ) : null}
            <div className="min-w-0">
              <p className="font-semibold text-text-primary">{o.product.name}</p>
              <p className="text-text-secondary">
                {o.quantity} × {etb(o.unit_price, o.currency)}
                {o.size ? ` · Size ${o.size}` : ""}
                {o.color ? ` · ${o.color}` : ""}
              </p>
              <p className="text-text-secondary">
                Buyer {o.buyer.name} {o.buyer.username ? `(@${o.buyer.username})` : ""} · Seller {o.seller.name}{" "}
                {o.seller.username ? `(@${o.seller.username})` : ""}
              </p>
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
            <Row label="Product subtotal" value={etb(o.subtotal, o.currency)} />
            <Row label="Delivery fee" value={etb(o.delivery_fee, o.currency)} />
            <Row label="Buyer total" value={etb(o.total, o.currency)} strong />
            <Row label={`Commission (${o.commission_rate ?? 0}% of subtotal)`} value={etb(o.commission_amount, o.currency)} />
            <Row label="Seller payout (net + delivery)" value={etb(o.seller_payout, o.currency)} strong />
            <Row label="Seller credited" value={shortDate(o.seller_credited_at)} />
          </div>
          {o.commission_note ? <p className="text-xs text-text-secondary">{o.commission_note}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 font-semibold text-text-primary">Delivery</p>
              <p className="text-text-secondary">{[o.delivery.address, o.delivery.city].filter(Boolean).join(", ") || "—"}</p>
              {o.delivery.phone ? <p className="text-text-secondary">{o.delivery.phone}</p> : null}
              {o.delivery.instructions ? <p className="text-text-secondary">“{o.delivery.instructions}”</p> : null}
              {o.delivery.latitude != null && o.delivery.longitude != null ? (
                <a
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps/search/?api=1&query=${o.delivery.latitude},${o.delivery.longitude}`}
                >
                  Open map
                </a>
              ) : null}
              {o.tracking_note ? <p className="mt-1 text-text-secondary">Seller note: {o.tracking_note}</p> : null}
            </div>
            <div>
              <p className="mb-1 font-semibold text-text-primary">Payment</p>
              {o.payment ? (
                <>
                  <p className="text-text-secondary">
                    {labelize(o.payment.method)} · {o.payment.status} · {etb(o.payment.amount, o.currency)}
                  </p>
                  <p className="text-text-secondary">Paid {shortDate(o.payment.paid_at)}</p>
                  {o.payment.provider_ref ? <p className="break-all text-xs text-text-hint">{o.payment.provider_ref}</p> : null}
                </>
              ) : (
                <p className="text-text-secondary">—</p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 font-semibold text-text-primary">Status history</p>
            <ol className="space-y-2 border-l border-border pl-4">
              {(o.events ?? []).map((e, i) => (
                <li key={i}>
                  <p className="text-text-primary">
                    {e.label} <span className="text-xs text-text-hint">· {labelize(e.actor_role)} · {shortDate(e.at)}</span>
                  </p>
                  {e.note ? <p className="text-xs text-text-secondary">{e.note}</p> : null}
                </li>
              ))}
            </ol>
          </div>

          {can("sports_market:write") && o.actions.length ? (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {o.actions.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={busy}
                  className={NEEDS_REASON.has(a) ? buttonClass : primaryButtonClass}
                  onClick={() => (NEEDS_REASON.has(a) ? setPending(a) : move(a))}
                >
                  {a === "delivered" && o.payment_method === "cod" ? "Delivered · cash received" : `Mark ${labelize(a).toLowerCase()}`}
                </button>
              ))}
            </div>
          ) : null}
          {can("sports_market:finance") && o.commission_status === "pending_settlement" && o.payment_status === "paid" ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <p className="text-text-secondary">Cash commission is waiting for settlement.</p>
              <button type="button" className={buttonClass} disabled={busy} onClick={() => setSettle(true)}>
                Settle commission
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <ReasonModal
        open={!!pending}
        title={`Mark order ${labelize(pending).toLowerCase()}`}
        saveLabel="Confirm"
        onClose={() => setPending(null)}
        onSubmit={async (reason) => {
          const status = pending!;
          setPending(null);
          await move(status, reason);
        }}
      />
      <SettleCommissionModal
        open={settle}
        order={o}
        onClose={() => setSettle(false)}
        onDone={(next) => {
          setOrder(next);
          onChanged();
        }}
      />
    </AdminModal>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-secondary">{label}</span>
      <span className={cn("tabular-nums", strong ? "font-semibold text-text-primary" : "text-text-primary")}>{value}</span>
    </div>
  );
}

export function SettleCommissionModal({
  open,
  order,
  onClose,
  onDone,
}: {
  open: boolean;
  order: SmOrder | null;
  onClose: () => void;
  onDone: (order: SmOrder) => void;
}) {
  const [method, setMethod] = useState<"wallet" | "manual">("wallet");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setMethod("wallet");
      setNote("");
      setError(null);
    }
  }, [open]);
  if (!order) return null;
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await smPost<SmOrder>(`/orders/${order.id}/settle-commission`, { method, note });
      onDone(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not settle");
    } finally {
      setSaving(false);
    }
  };
  return (
    <AdminModal
      open={open}
      title={`Settle ${etb(order.commission_amount, order.currency)} commission`}
      onClose={onClose}
      stacked
      footer={
        <AdminModalFooter
          onCancel={onClose}
          onSave={save}
          saving={saving}
          disabled={method === "manual" && note.trim().length < 3}
          saveLabel="Settle"
        />
      }
    >
      <div className="space-y-3 text-sm">
        {error ? <AdminErrorAlert message={error} /> : null}
        <label className="flex items-start gap-2">
          <input type="radio" checked={method === "wallet"} onChange={() => setMethod("wallet")} className="mt-1" />
          <span>Collect from the seller&apos;s Spojex wallet now</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" checked={method === "manual"} onChange={() => setMethod("manual")} className="mt-1" />
          <span>Record a payment received outside the app (bank transfer, cash)</span>
        </label>
        {method === "manual" ? (
          <div>
            <label className={labelClass}>Reference / note</label>
            <input className={fieldClass} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </div>
        ) : null}
      </div>
    </AdminModal>
  );
}
