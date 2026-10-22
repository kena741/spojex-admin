"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  actionVerb,
  initials,
  reasonRequired,
  type BookingAction,
  type BookingRow,
} from "@/lib/bookings";
import { adminCacheKey, invalidateAdminCache } from "@/lib/admin-session-cache";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useApplyAdminSnapshot } from "@/lib/use-admin-snapshot";
import { cn, formatDateTime, formatStatusLabel } from "@/lib/utils";

type DetailPayload = {
  data?: BookingRow;
  payment_attempts?: Array<Record<string, unknown>>;
  similar_bookings?: Array<{
    id: string;
    reference?: string;
    status?: string;
    created_at?: string;
    href?: string;
    note?: string;
  }>;
  timeline?: Array<Record<string, unknown>>;
  definitions?: Record<string, string>;
  error?: string;
};

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("requests:write");

  const [payload, setPayload] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleReason, setScheduleReason] = useState("");
  const [scheduleDirty, setScheduleDirty] = useState(false);

  const backHref = useMemo(() => {
    try {
      return sessionStorage.getItem("bookings-return") || "/admin/requests";
    } catch {
      return "/admin/requests";
    }
  }, []);

  const {
    data: snapshot,
    loading,
    error: loadError,
    refresh,
  } = useAdminQuery<DetailPayload>({
    key: adminCacheKey(["requests", "detail", id]),
    fetcher: async () => {
      const res = await fetch(`/api/admin/marketplace/bookings/${id}`, { cache: "no-store" });
      const body = (await res.json()) as DetailPayload;
      if (res.status === 404) throw new Error(body.error || "Booking not found");
      if (!res.ok) throw new Error(body.error || "Failed to load booking");
      return body;
    },
  });

  useApplyAdminSnapshot(snapshot, (body) => {
    setPayload(body);
    const at = body.data?.requested_at;
    if (at) {
      // datetime-local wants local wall time without Z
      const d = new Date(at);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setScheduleAt(local);
    } else {
      setScheduleAt("");
    }
    setScheduleDirty(false);
  });

  useEffect(() => {
    if (loadError) setError(loadError);
  }, [loadError]);

  /** Soft reload after a mutation; also drops the parent list cache. */
  const load = useCallback(async () => {
    setError(null);
    invalidateAdminCache(adminCacheKey(["requests", "list"]));
    const next = await refresh();
    if (!next) throw new Error("Failed to reload booking");
  }, [refresh]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (scheduleDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [scheduleDirty]);

  const booking = payload?.data;

  const transition = async (next: string, actions?: BookingAction[]) => {
    if (!booking || !canWrite) return;
    let reason: string | undefined;
    let forceComplete = false;
    if (reasonRequired(next, actions || booking.allowed_actions)) {
      reason =
        window.prompt(
          next === "completed"
            ? "Override reason (payment not verified - required):"
            : "Reason (required):",
        ) || undefined;
      if (!reason?.trim()) return;
      if (next === "completed") forceComplete = true;
    }
    if (next === "accepted" && booking.status === "awaiting_payment") {
      if (
        !window.confirm(
          "Accept while payment is still due? This does NOT verify payment.",
        )
      ) {
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/marketplace/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next,
          reason,
          expected_updated_at: booking.updated_at,
          force_complete: forceComplete,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Update failed");
      setNotice(body.message || `${actionVerb(next, booking.allowed_actions)} applied.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const saveSchedule = async (clear = false) => {
    if (!booking || !canWrite) return;
    if (!clear && !scheduleAt) {
      setError("Pick an appointment time, or clear the schedule.");
      return;
    }
    let reason = scheduleReason;
    if (!clear && booking.requested_at && !reason.trim()) {
      reason = window.prompt("Reason for reschedule (required):") || "";
      if (!reason.trim()) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/marketplace/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          clear,
          requested_at: clear ? null : new Date(scheduleAt).toISOString(),
          reason: reason || null,
          expected_updated_at: booking.updated_at,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Schedule update failed");
      setNotice(body.message || (clear ? "Schedule cleared." : "Schedule updated."));
      setScheduleReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Schedule update failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <AdminLoadingRow label="Loading booking…" />;

  if (!booking) {
    return (
      <>
        <AdminPageHeader title="Booking" backHref={backHref} />
        <AdminErrorAlert message={error || "Booking not found"} />
        <Link
          href={backHref}
          className="mt-3 inline-block rounded-md border border-border px-3 py-2 text-sm"
        >
          Back to directory
        </Link>
      </>
    );
  }

  const actions: BookingAction[] = booking.allowed_actions?.length
    ? booking.allowed_actions
    : (booking.allowed_transitions || []).map((s) => ({
        status: s,
        label: actionVerb(s),
      }));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={booking.reference || `BK-${booking.id.slice(0, 8).toUpperCase()}`}
        backHref={backHref}
        stackOnSmall
        breadcrumbs={[
          { label: "Bookings", href: backHref },
          { label: booking.reference || booking.id.slice(0, 8) },
        ]}
        actions={
          canWrite && actions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <button
                  key={a.status}
                  type="button"
                  disabled={busy}
                  title={a.note}
                  onClick={() => void transition(a.status, actions)}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50",
                    a.status === "accepted" || a.status === "completed"
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "border border-border bg-card hover:bg-muted",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          ) : null
        }
      />

      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      {payload?.definitions?.payment_policy ? (
        <p className="text-xs text-text-hint">{payload.definitions.payment_policy}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-heading text-sm font-semibold">Summary</h2>
          <dl className="space-y-2 text-sm">
            <Item label="Booking status">
              <StatusBadge tone={requestTone(booking.status)}>
                {formatStatusLabel(booking.status)}
              </StatusBadge>
            </Item>
            <Item label="Payment">{booking.payment?.label || "-"}</Item>
            {booking.payment?.refund_label ? (
              <Item label="Refund">{booking.payment.refund_label}</Item>
            ) : null}
            <Item label="Agreed amount">
              {booking.agreed_amount != null
                ? `${booking.agreed_currency || "ETB"} ${Number(booking.agreed_amount).toLocaleString("en-ET")}`
                : "-"}
            </Item>
            <Item label="Created">
              {booking.created_at ? formatDateTime(booking.created_at) : "-"}
            </Item>
            <Item label="Completed">
              {booking.completed_at ? formatDateTime(booking.completed_at) : "-"}
            </Item>
            <Item label="Requested appointment">
              {booking.appointment_label || "Not scheduled"}
            </Item>
            {booking.schedule_state === "overdue" ? (
              <Item label="Schedule">
                <span className="font-medium text-red-600">Overdue</span>
              </Item>
            ) : null}
            <Item label="Location">{booking.location || "-"}</Item>
            <Item label="Delivery">
              {booking.service?.delivery_label ||
                formatStatusLabel(booking.service?.availability_mode || "") ||
                "-"}
            </Item>
          </dl>
          {booking.payment_explanation ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-medium">{booking.payment_explanation.message}</p>
              {booking.payment_explanation.recovery ? (
                <p className="mt-1">{booking.payment_explanation.recovery}</p>
              ) : null}
            </div>
          ) : null}
          {booking.price_snapshot_note ? (
            <p className="mt-3 text-[11px] text-text-hint">{booking.price_snapshot_note}</p>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-heading text-sm font-semibold">Service & people</h2>
          <div className="flex gap-3">
            {booking.service?.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={booking.service.cover_url}
                alt=""
                className="h-20 w-24 rounded object-cover"
              />
            ) : null}
            <div>
              <Link
                href={booking.service_href || `/admin/services/${booking.service_id}`}
                className="font-medium text-primary"
              >
                {booking.service?.title || booking.service_id.slice(0, 8)}
              </Link>
              <p className="text-xs text-text-secondary">
                {booking.service?.price_label || "-"}
              </p>
              <p className="mt-1 text-[11px] text-text-hint">
                Live listing may have changed since this request.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PersonBlock
              label="Customer"
              person={booking.requester}
              href={booking.people_customer_href}
            />
            <PersonBlock
              label="Provider"
              person={booking.provider}
              href={booking.people_provider_href}
            />
          </div>
          {booking.message ? (
            <div className="mt-4">
              <p className="text-xs font-medium text-text-secondary">Customer message</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{booking.message}</p>
            </div>
          ) : null}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-heading text-sm font-semibold">Schedule</h2>
        <p className="mb-3 text-xs text-text-hint">
          {payload?.definitions?.appointment ||
            "requested_at is the preferred appointment. Not scheduled means both fields are null - never invented from created time."}
        </p>
        {canWrite ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Appointment (local)</span>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => {
                  setScheduleAt(e.target.value);
                  setScheduleDirty(true);
                }}
                className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
              />
            </label>
            <label className="grid min-w-[12rem] flex-1 gap-1 text-sm">
              <span className="text-text-secondary">Reason (required on change)</span>
              <input
                value={scheduleReason}
                onChange={(e) => {
                  setScheduleReason(e.target.value);
                  setScheduleDirty(true);
                }}
                className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
                placeholder="Optional for first set"
              />
            </label>
            <button
              type="button"
              disabled={busy || !scheduleDirty}
              onClick={() => void saveSchedule(false)}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {booking.requested_at ? "Confirm / reschedule" : "Set schedule"}
            </button>
            {booking.requested_at || booking.requested_on ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Clear appointment? Booking stays accepted if it is."))
                    return;
                  void saveSchedule(true);
                }}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                Clear schedule
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm">{booking.appointment_label || "Not scheduled"}</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-heading text-sm font-semibold">Payments</h2>
        {(payload?.payment_attempts?.length ?? 0) === 0 ? (
          <p className="text-sm text-text-secondary">
            {booking.payment_explanation?.message || "No payment attempts on file."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {(payload?.payment_attempts || []).map((p) => (
              <li key={String(p.id)} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium">{String(p.label || p.status || "-")}</p>
                  <p className="text-xs text-text-hint">
                    {String(p.currency || "ETB")} {Number(p.amount || 0).toLocaleString("en-ET")}
                    {p.provider_ref ? ` · ref ${String(p.provider_ref)}` : ""}
                  </p>
                </div>
                {p.finance_href ? (
                  <Link href={String(p.finance_href)} className="text-sm font-medium text-primary">
                    Finance tx
                  </Link>
                ) : booking.finance_href ? (
                  <Link href={booking.finance_href} className="text-sm font-medium text-primary">
                    Finance tx
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {booking.status === "cancelled" &&
        booking.payment?.label === "Verified" ? (
          <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-text-secondary">
            Booking is cancelled but payment remains verified. Refund is separate - not automatic.
          </p>
        ) : null}
      </section>

      {(payload?.similar_bookings?.length ?? 0) > 0 ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-2 font-heading text-sm font-semibold">Similar nearby requests</h2>
          <p className="mb-3 text-xs text-text-hint">
            Same customer and service within ±30 minutes. Distinct IDs - not merged.
          </p>
          <ul className="space-y-2 text-sm">
            {payload!.similar_bookings!.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <Link href={s.href || `/admin/requests/${s.id}`} className="text-primary">
                  {s.reference || s.id.slice(0, 8)}
                </Link>
                <span className="text-text-hint">
                  {formatStatusLabel(s.status || "")} ·{" "}
                  {s.created_at ? formatDateTime(s.created_at) : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(payload?.timeline?.length ?? 0) > 0 ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-heading text-sm font-semibold">Timeline</h2>
          <ul className="space-y-2 text-sm">
            {payload!.timeline!.map((t, i) => (
              <li key={i} className="border-b border-border pb-2 last:border-0">
                <p className="font-medium">{String(t.summary || t.action || "Event")}</p>
                <p className="text-xs text-text-hint">
                  {t.admin_name ? String(t.admin_name) : "Admin"} ·{" "}
                  {t.created_at ? formatDateTime(String(t.created_at)) : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function PersonBlock({
  label,
  person,
  href,
}: {
  label: string;
  person?: BookingRow["requester"];
  href?: string;
}) {
  if (!person?.id) {
    return (
      <div>
        <p className="text-xs text-text-secondary">{label}</p>
        <p className="text-sm">-</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {person.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
          {initials(person.display_name, person.id)}
        </span>
      )}
      <div>
        <p className="text-xs text-text-secondary">{label}</p>
        <Link href={href || `/admin/people/${person.id}`} className="text-sm font-medium text-primary">
          {person.display_name || person.id.slice(0, 8)}
        </Link>
      </div>
    </div>
  );
}
