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
  AdminReloadButton,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  AdminStatCard,
  AdminTableShell,
  type AdminRowMenuItem,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  actionMenuTone,
  actionVerb,
  initials,
  reasonRequired,
  shortActionLabel,
  type BookingRow,
  type BookingSummary,
} from "@/lib/bookings";
import { adminCacheKey, invalidateAdminCache } from "@/lib/admin-session-cache";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { cn, formatDateTime, formatMoney, formatStatusLabel } from "@/lib/utils";

type BookingsListData = {
  rows: BookingRow[];
  total: number;
  summary: BookingSummary;
  summaryHrefs: Record<string, string>;
  definitions: Record<string, string>;
};

function PersonChip({
  label,
  person,
  href,
}: {
  label: string;
  person?: BookingRow["requester"];
  href: string;
}) {
  if (!person?.id) {
    return (
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-text-hint">
          {label}
        </p>
        <p className="text-sm text-text-hint">—</p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-hint">
        {label}
      </p>
      <Link href={href} className="mt-0.5 flex min-w-0 items-center gap-2 hover:opacity-90">
        {person.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.avatar_url}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-primary">
            {initials(person.display_name, person.id)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-text-primary">
            {person.display_name || person.id.slice(0, 8)}
          </span>
          {person.role ? (
            <span className="block truncate text-[11px] text-text-secondary">
              {formatStatusLabel(person.role)}
            </span>
          ) : null}
        </span>
      </Link>
    </div>
  );
}

function ServiceThumb({
  coverUrl,
  title,
}: {
  coverUrl?: string | null;
  title?: string | null;
}) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt=""
        className="h-12 w-12 shrink-0 rounded-lg object-cover bg-muted sm:h-14 sm:w-14"
      />
    );
  }
  const letter = (title || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold text-text-secondary sm:h-14 sm:w-14"
      aria-hidden
    >
      {letter}
    </div>
  );
}

function moneyLabel(row: BookingRow) {
  if (row.payment?.amount != null) {
    return formatMoney(Number(row.payment.amount), row.payment.currency || "ETB");
  }
  if (row.agreed_amount != null) {
    return formatMoney(Number(row.agreed_amount), row.agreed_currency || "ETB");
  }
  return null;
}

export default function RequestsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = can("requests:write");

  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "all";
  const schedule = searchParams.get("schedule") || "";
  const event = searchParams.get("event") || "";
  const dateFrom = searchParams.get("from") || "";
  const dateTo = searchParams.get("to") || "";
  const paymentStatus = searchParams.get("payment_status") || "all";
  const scheduled = searchParams.get("scheduled") || "all";
  const page = Number(searchParams.get("page") || 1) || 1;
  const deepId = searchParams.get("id") || "";

  const [actionError, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const writeParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const {
    data: listData,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<BookingsListData>({
    key: adminCacheKey([
      "marketplace",
      "bookings",
      "list",
      page,
      q,
      status,
      schedule,
      event,
      dateFrom,
      dateTo,
      paymentStatus,
      scheduled,
    ]),
    fetcher: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "40",
      });
      if (status !== "all") params.set("status", status);
      if (schedule) params.set("schedule", schedule);
      if (event) params.set("event", event);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (q) params.set("q", q);
      if (paymentStatus !== "all") params.set("payment_status", paymentStatus);
      if (scheduled !== "all") params.set("scheduled", scheduled);
      const res = await fetch(`/api/admin/marketplace/bookings?${params}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as {
        data?: BookingRow[];
        total?: number;
        summary_scope?: { global?: BookingSummary; filtered?: { bookings?: number } };
        summary_hrefs?: Record<string, string>;
        definitions?: Record<string, string>;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Failed to load bookings");
      return {
        rows: payload.data ?? [],
        total: payload.total ?? 0,
        summary: payload.summary_scope?.global ?? {},
        summaryHrefs: payload.summary_hrefs ?? {},
        definitions: payload.definitions ?? {},
      };
    },
  });

  const rows = useMemo(() => listData?.rows ?? [], [listData]);
  const total = listData?.total ?? 0;
  const summary = listData?.summary ?? {};
  const summaryHrefs = listData?.summaryHrefs ?? {};
  const definitions = listData?.definitions ?? {};
  const error = actionError ?? loadError;
  const ok = listData != null && !loadError;

  useEffect(() => {
    if (deepId && /^[0-9a-f-]{36}$/i.test(deepId)) {
      router.replace(`/admin/requests/${deepId}`);
    }
  }, [deepId, router]);

  const transition = async (row: BookingRow, next: string) => {
    if (!canWrite) return;
    let reason: string | undefined;
    let forceComplete = false;
    const needsReason = reasonRequired(next, row.allowed_actions);
    if (needsReason) {
      reason =
        window.prompt(
          next === "completed"
            ? "Override reason (payment not verified - required):"
            : "Reason (required):",
        ) || undefined;
      if (!reason?.trim()) return;
      if (next === "completed") forceComplete = true;
    }
    if (next === "accepted" && row.status === "awaiting_payment") {
      if (
        !window.confirm(
          "Accept this booking while payment is still due?\n\nThis does NOT verify or capture payment.",
        )
      ) {
        return;
      }
    }
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/marketplace/bookings/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next,
          reason,
          expected_updated_at: row.updated_at,
          force_complete: forceComplete,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || payload.detail || "Update failed");
      setNotice(payload.message || `${actionVerb(next, row.allowed_actions)} applied.`);
      invalidateAdminCache("marketplace");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const openBooking = (id: string) => {
    sessionStorage.setItem("bookings-return", `${pathname}?${searchParams.toString()}`);
    router.push(`/admin/requests/${id}`);
  };

  const pageCount = Math.max(1, Math.ceil(total / 40));
  const g = summary;

  const cards: Array<{
    key: keyof BookingSummary;
    title: string;
    hrefKey: string;
  }> = [
    { key: "awaiting_response", title: "Awaiting response", hrefKey: "awaiting_response" },
    { key: "awaiting_payment", title: "Awaiting payment", hrefKey: "awaiting_payment" },
    {
      key: "accepted_unscheduled",
      title: "Accepted, unscheduled",
      hrefKey: "accepted_unscheduled",
    },
    { key: "upcoming", title: "Upcoming (14d)", hrefKey: "upcoming" },
    { key: "completed_period", title: "Completed (period)", hrefKey: "completed_period" },
    { key: "closed_period", title: "Cancelled/declined", hrefKey: "closed_period" },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Bookings"
        description="Service appointments and requests. Booking status and payment status stay separate."
        actions={
          <AdminReloadButton loading={loading} refreshing={refreshing} onClick={() => void refresh()} />
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            className="text-left transition-opacity hover:opacity-90"
            onClick={() => {
              const href = summaryHrefs[c.hrefKey];
              if (href) router.push(href);
            }}
          >
            <AdminStatCard
              title={c.title}
              value={loading ? "…" : String(g[c.key] ?? "-")}
            />
          </button>
        ))}
      </div>
      {g.period_from && g.period_to ? (
        <p className="text-xs text-text-secondary">
          Period cards: {g.period_from} → {g.period_to}
          {definitions.payment_policy ? ` · ${definitions.payment_policy}` : ""}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      {error ? (
        <div className="space-y-2">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium"
          >
            Retry
          </button>
        </div>
      ) : null}

      <AdminFilterPanel>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <AdminSearchInput
            value={q}
            onChange={(value) => writeParams({ q: value || null, page: "1" })}
            placeholder="Search service, customer, provider, id…"
          />
          <AdminSelect
            value={status}
            onChange={(value) => writeParams({ status: value, page: "1" })}
          >
            <option value="all">All booking statuses</option>
            <option value="pending,awaiting_payment">Pending + awaiting payment</option>
            <option value="cancelled,declined">Cancelled / declined</option>
            {["pending", "awaiting_payment", "accepted", "declined", "completed", "cancelled"].map(
              (s) => (
                <option key={s} value={s}>
                  {formatStatusLabel(s)}
                </option>
              ),
            )}
          </AdminSelect>
          <AdminSelect
            value={schedule || "all"}
            onChange={(value) =>
              writeParams({ schedule: value === "all" ? null : value, page: "1" })
            }
          >
            <option value="all">Any schedule facet</option>
            <option value="upcoming_14d">Upcoming (14d)</option>
            <option value="unscheduled">Accepted, not scheduled</option>
            <option value="overdue">Overdue appointments</option>
          </AdminSelect>
          <AdminSelect
            value={paymentStatus}
            onChange={(value) => writeParams({ payment_status: value, page: "1" })}
          >
            <option value="all">All payment states</option>
            <option value="verified">Verified</option>
            <option value="awaiting">Awaiting verification</option>
            <option value="failed">Failed</option>
            <option value="none">No payment record</option>
            <option value="refunded">Refunded</option>
          </AdminSelect>
          <AdminSelect
            value={scheduled}
            onChange={(value) => writeParams({ scheduled: value, page: "1" })}
          >
            <option value="all">Scheduled or not</option>
            <option value="yes">Has appointment</option>
            <option value="no">Unscheduled</option>
          </AdminSelect>
          <label className="grid gap-1 text-xs text-text-secondary">
            <span>From date</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) =>
                writeParams({
                  from: e.target.value || null,
                  event: e.target.value || dateTo ? event || "created" : null,
                  page: "1",
                })
              }
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="grid gap-1 text-xs text-text-secondary">
            <span>To date</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) =>
                writeParams({
                  to: e.target.value || null,
                  event: e.target.value || dateFrom ? event || "created" : null,
                  page: "1",
                })
              }
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>
        {(dateFrom || dateTo) && (
          <p className="mt-2 text-xs text-text-hint">
            Filtering by {event || "created"} date
            {dateFrom ? ` from ${dateFrom}` : ""}
            {dateTo ? ` to ${dateTo}` : ""}
            <button
              type="button"
              className="ml-2 text-primary hover:underline"
              onClick={() => writeParams({ from: null, to: null, event: null, page: "1" })}
            >
              Clear dates
            </button>
          </p>
        )}
      </AdminFilterPanel>

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <AdminLoadingRow label="Loading bookings…" compact className="py-10" />
        </div>
      ) : null}

      {!loading && ok && rows.length === 0 && !error ? (
        <AdminEmpty
          title="No bookings"
          description="Nothing matches these filters. Adjust filters and reload."
        />
      ) : null}

      {!loading && rows.length > 0 ? (
        <AdminTableShell>
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const actions = row.allowed_actions?.length
                ? row.allowed_actions
                : (row.allowed_transitions || []).map((s) => ({
                    status: s,
                    label: actionVerb(s),
                  }));
              const money = moneyLabel(row);
              const ref = row.reference || `BK-${row.id.slice(0, 8).toUpperCase()}`;
              const menuItems: AdminRowMenuItem[] = canWrite
                ? actions.map((a, index) => ({
                    id: a.status,
                    label: shortActionLabel(a.status, row.allowed_actions),
                    tone: actionMenuTone(a.status),
                    disabled: busyId === row.id,
                    separatorBefore: index > 0 && actionMenuTone(a.status) === "danger",
                    onClick: () => void transition(row, a.status),
                  }))
                : [];

              return (
                <li
                  key={row.id}
                  className={cn(
                    "grid gap-3 p-3 sm:p-4",
                    "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]",
                    "sm:items-center",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openBooking(row.id)}
                    className="flex min-w-0 gap-3 text-left"
                  >
                    <ServiceThumb
                      coverUrl={row.service?.cover_url}
                      title={row.service?.title}
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-text-primary sm:text-[15px]">
                          {row.service?.title || row.service_id.slice(0, 8)}
                        </p>
                        <StatusBadge tone={requestTone(row.status)}>
                          {formatStatusLabel(row.status)}
                        </StatusBadge>
                      </div>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-secondary">
                        <span className="font-mono text-text-hint">{ref}</span>
                        <span aria-hidden className="text-border">
                          ·
                        </span>
                        {row.appointment_label === "Not scheduled" ||
                        (!row.requested_at && !row.requested_on) ? (
                          <span className="text-text-hint">Not scheduled</span>
                        ) : (
                          <span>{formatDateTime(row.requested_at || row.requested_on)}</span>
                        )}
                        {row.schedule_state === "overdue" ? (
                          <span className="font-medium text-red-600">Overdue</span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-text-hint">
                        Created {row.created_at ? formatDateTime(row.created_at) : "—"}
                      </p>
                    </div>
                  </button>

                  <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
                    <PersonChip
                      label="Customer"
                      person={row.requester}
                      href={row.people_customer_href || `/admin/people/${row.requester?.id}`}
                    />
                    <PersonChip
                      label="Provider"
                      person={row.provider}
                      href={row.people_provider_href || `/admin/people/${row.provider?.id}`}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-2">
                    <div className="min-w-0 sm:text-right">
                      <p className="text-xs font-medium text-text-primary">
                        {row.payment?.label || "No payment record"}
                      </p>
                      {money ? (
                        <p className="tabular-nums text-[11px] text-text-secondary">{money}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openBooking(row.id)}
                        className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        Open
                      </button>
                      {menuItems.length > 0 ? (
                        <AdminRowMenu
                          items={menuItems}
                          disabled={busyId === row.id}
                          aria-label={`Actions for ${ref}`}
                        />
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-text-secondary">
            <span>
              Page {page} of {pageCount} · {total} matching
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => writeParams({ page: String(page - 1) })}
                className="rounded-md border border-border px-2.5 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => writeParams({ page: String(page + 1) })}
                className="rounded-md border border-border px-2.5 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </AdminTableShell>
      ) : null}
    </div>
  );
}
