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

function Avatar({
  name,
  src,
  id,
}: {
  name?: string | null;
  src?: string | null;
  id?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-primary">
      {initials(name, id)}
    </span>
  );
}

function PersonCell({
  person,
  href,
}: {
  person?: BookingRow["requester"];
  href: string;
}) {
  if (!person?.id) return <span className="text-text-hint">—</span>;
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="flex min-w-0 items-center gap-2 hover:opacity-90"
    >
      <Avatar name={person.display_name} src={person.avatar_url} id={person.id} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-text-primary">
          {person.display_name || person.id.slice(0, 8)}
        </span>
        {person.role ? (
          <span className="block truncate text-[11px] text-text-hint">
            {formatStatusLabel(person.role)}
          </span>
        ) : null}
      </span>
    </Link>
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

function scheduleLabel(row: BookingRow) {
  if (
    row.appointment_label === "Not scheduled" ||
    (!row.requested_at && !row.requested_on)
  ) {
    return { text: "Not scheduled", overdue: false, muted: true };
  }
  return {
    text: formatDateTime(row.requested_at || row.requested_on),
    overdue: row.schedule_state === "overdue",
    muted: false,
  };
}

function rowActions(row: BookingRow): Array<{ status: string; label: string }> {
  if (row.allowed_actions?.length) return row.allowed_actions;
  return (row.allowed_transitions || []).map((s) => ({
    status: s,
    label: actionVerb(s),
  }));
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
  const [filtersOpen, setFiltersOpen] = useState(
    () => Boolean(dateFrom || dateTo || paymentStatus !== "all" || scheduled !== "all"),
  );

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
  const error = actionError ?? loadError;

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

  const queueViews: Array<{
    id: string;
    label: string;
    count?: number;
    hrefKey?: string;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      id: "all",
      label: "All",
      active: status === "all" && !schedule && paymentStatus === "all" && scheduled === "all" && !q,
      onClick: () =>
        writeParams({
          status: null,
          schedule: null,
          payment_status: null,
          scheduled: null,
          q: null,
          from: null,
          to: null,
          event: null,
          page: "1",
        }),
    },
    {
      id: "awaiting_response",
      label: "Awaiting response",
      count: g.awaiting_response,
      hrefKey: "awaiting_response",
      active: false,
      onClick: () => {
        const href = summaryHrefs.awaiting_response;
        if (href) router.push(href);
        else writeParams({ status: "pending", page: "1" });
      },
    },
    {
      id: "awaiting_payment",
      label: "Awaiting payment",
      count: g.awaiting_payment,
      hrefKey: "awaiting_payment",
      active: status === "awaiting_payment",
      onClick: () => {
        const href = summaryHrefs.awaiting_payment;
        if (href) router.push(href);
        else writeParams({ status: "awaiting_payment", page: "1" });
      },
    },
    {
      id: "unscheduled",
      label: "Unscheduled",
      count: g.accepted_unscheduled,
      active: schedule === "unscheduled",
      onClick: () => {
        const href = summaryHrefs.accepted_unscheduled;
        if (href) router.push(href);
        else writeParams({ schedule: "unscheduled", page: "1" });
      },
    },
    {
      id: "upcoming",
      label: "Upcoming",
      count: g.upcoming,
      active: schedule === "upcoming_14d",
      onClick: () => {
        const href = summaryHrefs.upcoming;
        if (href) router.push(href);
        else writeParams({ schedule: "upcoming_14d", page: "1" });
      },
    },
  ];

  // Mark active queue from URL when possible
  for (const view of queueViews) {
    if (view.id === "awaiting_response" && status === "pending") view.active = true;
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Bookings"
        description="Service appointments. Booking status and payment stay separate."
        actions={
          <AdminReloadButton loading={loading} refreshing={refreshing} onClick={() => void refresh()} />
        }
      />

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
        <div className="mb-3 flex flex-wrap gap-1.5">
          {queueViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={view.onClick}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                view.active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-text-secondary hover:text-foreground",
              )}
            >
              {view.label}
              {view.count != null && !loading ? (
                <span
                  className={cn(
                    "tabular-nums",
                    view.active ? "text-primary-foreground/80" : "text-text-hint",
                  )}
                >
                  {view.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
          <AdminSearchInput
            value={q}
            onChange={(value) => writeParams({ q: value || null, page: "1" })}
            placeholder="Search service, customer, provider, booking id…"
          />
          <AdminSelect
            value={status}
            onChange={(value) => writeParams({ status: value, page: "1" })}
          >
            <option value="all">All statuses</option>
            <option value="pending,awaiting_payment">Needs attention</option>
            <option value="accepted">Accepted</option>
            <option value="completed">Completed</option>
            <option value="cancelled,declined">Cancelled / declined</option>
            {["pending", "awaiting_payment", "declined", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {formatStatusLabel(s)}
              </option>
            ))}
          </AdminSelect>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="h-10 rounded-md border border-border bg-card px-3 text-xs font-medium text-text-secondary hover:text-foreground"
          >
            {filtersOpen ? "Hide filters" : "More filters"}
          </button>
        </div>

        {filtersOpen ? (
          <div className="mt-3 grid gap-2 border-t border-border pt-3 md:grid-cols-2 xl:grid-cols-4">
            <AdminSelect
              value={schedule || "all"}
              onChange={(value) =>
                writeParams({ schedule: value === "all" ? null : value, page: "1" })
              }
            >
              <option value="all">Any schedule</option>
              <option value="upcoming_14d">Upcoming (14d)</option>
              <option value="unscheduled">Accepted, not scheduled</option>
              <option value="overdue">Overdue</option>
            </AdminSelect>
            <AdminSelect
              value={paymentStatus}
              onChange={(value) => writeParams({ payment_status: value, page: "1" })}
            >
              <option value="all">All payments</option>
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
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={dateFrom}
                aria-label="From date"
                onChange={(e) =>
                  writeParams({
                    from: e.target.value || null,
                    event: e.target.value || dateTo ? event || "created" : null,
                    page: "1",
                  })
                }
                className="h-10 rounded-lg border border-border bg-card px-2 text-sm"
              />
              <input
                type="date"
                value={dateTo}
                aria-label="To date"
                onChange={(e) =>
                  writeParams({
                    to: e.target.value || null,
                    event: e.target.value || dateFrom ? event || "created" : null,
                    page: "1",
                  })
                }
                className="h-10 rounded-lg border border-border bg-card px-2 text-sm"
              />
            </div>
          </div>
        ) : null}
      </AdminFilterPanel>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-text-secondary">
          <span>{loading ? "Loading…" : `${total} booking${total === 1 ? "" : "s"}`}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => writeParams({ page: String(page - 1) })}
              className="rounded border border-border px-2 py-0.5 disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount || loading}
              onClick={() => writeParams({ page: String(page + 1) })}
              className="rounded border border-border px-2 py-0.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>

        {loading ? (
          <AdminLoadingRow label="Loading bookings…" compact className="py-12" />
        ) : rows.length === 0 ? (
          <AdminEmpty
            title="No bookings"
            description="Nothing matches these filters. Try a queue chip or clear search."
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-text-secondary">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Service</th>
                    <th className="px-4 py-2.5 font-semibold">Customer</th>
                    <th className="px-4 py-2.5 font-semibold">Provider</th>
                    <th className="px-4 py-2.5 font-semibold">When</th>
                    <th className="px-4 py-2.5 font-semibold">Payment</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => {
                    const ref = row.reference || `BK-${row.id.slice(0, 8).toUpperCase()}`;
                    const when = scheduleLabel(row);
                    const money = moneyLabel(row);
                    const actions = rowActions(row);
                    const menuItems: AdminRowMenuItem[] = [
                      {
                        id: "open",
                        label: "Open booking",
                        onClick: () => openBooking(row.id),
                      },
                      ...actions.map((a, index) => ({
                        id: a.status,
                        label: shortActionLabel(a.status, row.allowed_actions),
                        tone: actionMenuTone(a.status),
                        disabled: busyId === row.id || !canWrite,
                        separatorBefore: index === 0,
                        onClick: () => void transition(row, a.status),
                      })),
                    ];
                    return (
                      <tr
                        key={row.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => openBooking(row.id)}
                      >
                        <td className="px-4 py-3 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            {row.service?.cover_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.service.cover_url}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded-md object-cover bg-muted"
                              />
                            ) : (
                              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-text-secondary">
                                {(row.service?.title || "?").charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium text-text-primary">
                                {row.service?.title || row.service_id.slice(0, 8)}
                              </p>
                              <p className="font-mono text-[11px] text-text-hint">{ref}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <PersonCell
                            person={row.requester}
                            href={
                              row.people_customer_href || `/admin/people/${row.requester?.id}`
                            }
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <PersonCell
                            person={row.provider}
                            href={
                              row.people_provider_href || `/admin/people/${row.provider?.id}`
                            }
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <p
                            className={cn(
                              "text-sm",
                              when.muted ? "text-text-hint" : "text-text-primary",
                              when.overdue && "font-medium text-red-600",
                            )}
                          >
                            {when.text}
                            {when.overdue ? " · Overdue" : ""}
                          </p>
                          <p className="text-[11px] text-text-hint">
                            Created {row.created_at ? formatDateTime(row.created_at) : "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <p className="text-sm text-text-primary">
                            {row.payment?.label || "No payment"}
                          </p>
                          {money ? (
                            <p className="tabular-nums text-[11px] text-text-secondary">{money}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <StatusBadge tone={requestTone(row.status)}>
                            {formatStatusLabel(row.status)}
                          </StatusBadge>
                        </td>
                        <td
                          className="px-4 py-3 align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <AdminRowMenu
                            items={menuItems}
                            disabled={busyId === row.id}
                            aria-label={`Actions for ${ref}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet list */}
            <ul className="divide-y divide-border lg:hidden">
              {rows.map((row) => {
                const ref = row.reference || `BK-${row.id.slice(0, 8).toUpperCase()}`;
                const when = scheduleLabel(row);
                const money = moneyLabel(row);
                const actions = rowActions(row);
                const menuItems: AdminRowMenuItem[] = [
                  {
                    id: "open",
                    label: "Open booking",
                    onClick: () => openBooking(row.id),
                  },
                  ...actions.map((a, index) => ({
                    id: a.status,
                    label: shortActionLabel(a.status, row.allowed_actions),
                    tone: actionMenuTone(a.status),
                    disabled: busyId === row.id || !canWrite,
                    separatorBefore: index === 0,
                    onClick: () => void transition(row, a.status),
                  })),
                ];
                return (
                  <li key={row.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openBooking(row.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openBooking(row.id);
                        }
                      }}
                      className="flex cursor-pointer gap-3 px-4 py-3 hover:bg-muted/30"
                    >
                      {row.service?.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.service.cover_url}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-md object-cover bg-muted"
                        />
                      ) : (
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-muted text-sm font-semibold text-text-secondary">
                          {(row.service?.title || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-text-primary">
                              {row.service?.title || row.service_id.slice(0, 8)}
                            </p>
                            <p className="font-mono text-[11px] text-text-hint">{ref}</p>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <AdminRowMenu
                              items={menuItems}
                              disabled={busyId === row.id}
                              aria-label={`Actions for ${ref}`}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={requestTone(row.status)}>
                            {formatStatusLabel(row.status)}
                          </StatusBadge>
                          <span
                            className={cn(
                              "text-xs",
                              when.muted ? "text-text-hint" : "text-text-secondary",
                              when.overdue && "font-medium text-red-600",
                            )}
                          >
                            {when.text}
                          </span>
                        </div>
                        <p className="truncate text-xs text-text-secondary">
                          {[
                            row.requester?.display_name,
                            row.provider?.display_name,
                            row.payment?.label || money,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
