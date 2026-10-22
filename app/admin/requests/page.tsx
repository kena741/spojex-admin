"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  AdminStatCard,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  actionVerb,
  initials,
  reasonRequired,
  type BookingRow,
  type BookingSummary,
} from "@/lib/bookings";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn, formatDateTime, formatStatusLabel } from "@/lib/utils";

function PersonCell({
  person,
  href,
}: {
  person?: BookingRow["requester"];
  href: string;
}) {
  if (!person?.id) return <span className="text-text-hint">-</span>;
  return (
    <Link href={href} className="flex items-center gap-2 hover:opacity-90">
      {person.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-primary">
          {initials(person.display_name, person.id)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-primary">
          {person.display_name || person.id.slice(0, 8)}
        </span>
        {person.role ? (
          <span className="block truncate text-[10px] text-text-hint">
            {formatStatusLabel(person.role)}
          </span>
        ) : null}
      </span>
    </Link>
  );
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

  const [rows, setRows] = useState<BookingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<BookingSummary>({});
  const [summaryHrefs, setSummaryHrefs] = useState<Record<string, string>>({});
  const [definitions, setDefinitions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadGen = useRef(0);

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

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoading(true);
    setError(null);
    setOk(false);
    try {
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
      if (gen !== loadGen.current) return;
      if (!res.ok) throw new Error(payload.error || "Failed to load bookings");
      setRows(payload.data ?? []);
      setTotal(payload.total ?? 0);
      setSummary(payload.summary_scope?.global ?? {});
      setSummaryHrefs(payload.summary_hrefs ?? {});
      setDefinitions(payload.definitions ?? {});
      setOk(true);
    } catch (err) {
      if (gen !== loadGen.current) return;
      setError(err instanceof Error ? err.message : "Failed to load");
      setRows([]);
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [page, q, status, schedule, event, dateFrom, dateTo, paymentStatus, scheduled]);

  useEffect(() => {
    void load();
  }, [load]);

  // Marketplace Overview `id=` drill-down → open detail
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
      await load();
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
    { key: "closed_period", title: "Cancelled/declined (period)", hrefKey: "closed_period" },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Bookings"
        description="Manage service appointments and requests. Booking status and payment status stay separate."
        actions={<AdminReloadButton loading={loading} onClick={() => void load()} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            className="text-left"
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
        <p className="text-xs text-text-hint">
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
            onClick={() => void load()}
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
        </div>
        {(dateFrom || dateTo || event) && (
          <p className="mt-2 text-xs text-text-hint">
            Date filter ({event || "created"}): {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : ""}
            <button
              type="button"
              className="ml-2 text-primary hover:underline"
              onClick={() => writeParams({ from: null, to: null, event: null, page: "1" })}
            >
              Clear
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
        <AdminEmpty title="No bookings" description="Nothing matches these filters. Adjust filters and Reload." />
      ) : null}

      {/* Mobile cards */}
      {!loading && rows.length > 0 ? (
        <ul className="space-y-3 md:hidden">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex gap-3">
                {row.service?.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.service.cover_url}
                    alt=""
                    className="h-14 w-16 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="grid h-14 w-16 shrink-0 place-items-center rounded bg-muted text-[10px] text-text-hint">
                    -
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] text-text-hint">
                    {row.reference || `BK-${row.id.slice(0, 8).toUpperCase()}`}
                  </p>
                  <p className="font-medium text-text-primary">
                    {row.service?.title || row.service_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {row.appointment_label === "Not scheduled" ? (
                      <span className="text-text-hint">Not scheduled</span>
                    ) : (
                      formatDateTime(row.requested_at || row.requested_on)
                    )}
                    {row.schedule_state === "overdue" ? (
                      <span className="ml-1 font-medium text-red-600">· Overdue</span>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge tone={requestTone(row.status)}>
                  {formatStatusLabel(row.status)}
                </StatusBadge>
                <span className="text-xs text-text-secondary">{row.payment?.label || "-"}</span>
                <button
                  type="button"
                  onClick={() => openBooking(row.id)}
                  className="ml-auto rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  Open
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Desktop rich list */}
      {!loading && rows.length > 0 ? (
        <div className="hidden md:block">
        <AdminTableShell>
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const actions: Array<{ status: string; label: string; note?: string }> =
                row.allowed_actions?.length
                  ? row.allowed_actions
                  : (row.allowed_transitions || []).map((s) => ({
                      status: s,
                      label: actionVerb(s),
                    }));
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center"
                >
                  <button
                    type="button"
                    onClick={() => openBooking(row.id)}
                    className="flex min-w-0 flex-1 gap-3 text-left"
                  >
                    {row.service?.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.service.cover_url}
                        alt=""
                        className="aspect-[4/3] w-20 shrink-0 rounded-md object-cover bg-muted"
                      />
                    ) : (
                      <div className="grid aspect-[4/3] w-20 shrink-0 place-items-center rounded-md bg-muted text-[10px] text-text-hint">
                        No photo
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] text-text-hint">
                        {row.reference || `BK-${row.id.slice(0, 8).toUpperCase()}`}
                      </p>
                      <p className="font-medium text-text-primary">
                        {row.service?.title || row.service_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {row.appointment_label === "Not scheduled" ||
                        (!row.requested_at && !row.requested_on) ? (
                          <span className="text-text-hint">Not scheduled</span>
                        ) : (
                          formatDateTime(row.requested_at || row.requested_on)
                        )}
                        {row.schedule_state === "overdue" ? (
                          <span className="ml-1 font-medium text-red-600">· Overdue</span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-text-hint">
                        Created {row.created_at ? formatDateTime(row.created_at) : "-"}
                      </p>
                    </div>
                  </button>

                  <div className="flex shrink-0 flex-wrap items-center gap-4 lg:justify-end">
                    <PersonCell
                      person={row.requester}
                      href={row.people_customer_href || `/admin/people/${row.requester?.id}`}
                    />
                    <PersonCell
                      person={row.provider}
                      href={row.people_provider_href || `/admin/people/${row.provider?.id}`}
                    />
                    <div className="min-w-[7rem] text-right text-xs">
                      <p className="font-medium">{row.payment?.label || "-"}</p>
                      {row.payment?.amount != null ? (
                        <p className="text-text-hint">
                          {row.payment.currency}{" "}
                          {Number(row.payment.amount).toLocaleString("en-ET")}
                        </p>
                      ) : row.agreed_amount != null ? (
                        <p className="text-text-hint">
                          {row.agreed_currency} {Number(row.agreed_amount).toLocaleString("en-ET")}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge tone={requestTone(row.status)}>
                      {formatStatusLabel(row.status)}
                    </StatusBadge>
                    <button
                      type="button"
                      onClick={() => openBooking(row.id)}
                      className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      Open
                    </button>
                    {canWrite && actions.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {actions.map((a) => (
                          <button
                            key={a.status}
                            type="button"
                            disabled={busyId === row.id}
                            title={a.note}
                            onClick={() => void transition(row, a.status)}
                            className="rounded border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-secondary">
            <span>
              Page {page} of {pageCount} · {total} matching
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => writeParams({ page: String(page - 1) })}
                className="rounded border border-border px-2 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => writeParams({ page: String(page + 1) })}
                className="rounded border border-border px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </AdminTableShell>
        </div>
      ) : null}
    </div>
  );
}
