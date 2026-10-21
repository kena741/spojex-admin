"use client";

import { useCallback, useEffect, useState } from "react";
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
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { patchAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn, formatDateTime, formatStatusLabel } from "@/lib/utils";

type Person = {
  id: string;
  display_name?: string | null;
  email?: string | null;
  role?: string | null;
  avatar_url?: string | null;
};

type BookingRow = {
  id: string;
  service_id: string;
  service?: { id: string; title?: string | null; pricing_type?: string | null } | null;
  requester?: Person | null;
  provider?: Person | null;
  location?: string | null;
  appointment_label?: string;
  requested_at?: string | null;
  requested_on?: string | null;
  status: string;
  created_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  payment?: {
    id?: string | null;
    status?: string | null;
    amount?: string | number | null;
    currency?: string | null;
    label?: string;
  } | null;
  allowed_transitions?: string[];
  finance_tx_id?: string | null;
};

function initials(name?: string | null, id?: string) {
  const n = (name || "").trim();
  if (n) {
    const parts = n.split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  }
  return (id || "?").slice(0, 2).toUpperCase();
}

function PersonCell({ person, href }: { person?: Person | null; href: string }) {
  if (!person?.id) return <span className="text-text-hint">—</span>;
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
  const page = Number(searchParams.get("page") || 1) || 1;

  const [rows, setRows] = useState<BookingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<BookingRow | null>(null);

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
      const res = await fetch(`/api/admin/marketplace/bookings?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as {
        data?: BookingRow[];
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Failed to load bookings");
      setRows(payload.data ?? []);
      setTotal(payload.total ?? 0);
      setOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, q, status, schedule, event, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const transition = async (row: BookingRow, next: string) => {
    if (!canWrite) return;
    let reason: string | undefined;
    if (["declined", "cancelled", "canceled"].includes(next)) {
      reason = window.prompt("Reason (required):") || undefined;
      if (!reason?.trim()) return;
    }
    setBusyId(row.id);
    setError(null);
    try {
      // Prefer Python transition endpoint; fall back to legacy PATCH
      const res = await fetch(`/api/admin/marketplace/bookings/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next,
          reason,
          expected_updated_at: row.updated_at,
        }),
      });
      if (res.status === 404) {
        await patchAdmin(`/api/admin/requests/${row.id}`, { status: next, reason });
      } else {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || payload.detail || "Update failed");
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
        title="Bookings"
        description="Booking status and payment status are separate. Appointment times come from the request — never invented."
      />

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
        <div className="grid gap-2 md:grid-cols-[1fr_200px_180px]">
          <AdminSearchInput
            value={q}
            onChange={(value) => writeParams({ q: value || null, page: "1" })}
            placeholder="Search service, customer, provider, id…"
          />
          <AdminSelect
            value={status.includes(",") ? status : status}
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
            <option value="all">Any schedule</option>
            <option value="upcoming_14d">Upcoming (14d)</option>
            <option value="unscheduled">Accepted, not scheduled</option>
            <option value="overdue">Overdue appointments</option>
          </AdminSelect>
        </div>
        {(dateFrom || dateTo || event) && (
          <p className="mt-2 text-xs text-text-hint">
            Date filter: {event || "created"}{" "}
            {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : ""}
            <button
              type="button"
              className="ml-2 text-primary hover:underline"
              onClick={() =>
                writeParams({ from: null, to: null, event: null, page: "1" })
              }
            >
              Clear
            </button>
          </p>
        )}
      </AdminFilterPanel>

      {loading ? <AdminLoadingRow label="Loading bookings…" /> : null}
      {!loading && ok && rows.length === 0 && !error ? (
        <AdminEmpty title="No bookings" description="Nothing matches these filters." />
      ) : null}

      {rows.length > 0 ? (
        <AdminTableShell>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Provider</th>
                  <th className="px-4 py-3 font-semibold">Appointment</th>
                  <th className="px-4 py-3 font-semibold">Payment</th>
                  <th className="px-4 py-3 font-semibold">Booking</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border last:border-0",
                      selected?.id === row.id && "bg-secondary/40",
                    )}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(row)}
                        className="text-left font-medium text-primary hover:underline"
                      >
                        {row.service?.title || row.service_id.slice(0, 8)}
                      </button>
                      {row.location ? (
                        <p className="text-xs text-text-secondary">{row.location}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <PersonCell
                        person={row.requester}
                        href={`/admin/people/${row.requester?.id || ""}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <PersonCell
                        person={row.provider}
                        href={`/admin/people/${row.provider?.id || ""}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {row.appointment_label === "Not scheduled" ||
                      (!row.requested_at && !row.requested_on) ? (
                        <span className="text-text-hint">Not scheduled</span>
                      ) : (
                        formatDateTime(row.requested_at || row.requested_on)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium">{row.payment?.label || "—"}</p>
                      {row.payment?.amount != null ? (
                        <p className="text-[11px] text-text-hint">
                          {row.payment.currency} {Number(row.payment.amount).toLocaleString("en-ET")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone(row.status)}>
                        {formatStatusLabel(row.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {row.created_at ? formatDateTime(row.created_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {(row.allowed_transitions?.length ?? 0) > 0 && canWrite ? (
                        <div className="flex flex-wrap gap-1">
                          {row.allowed_transitions!.map((next) => (
                            <button
                              key={next}
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => void transition(row, next)}
                              className="rounded border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
                            >
                              {formatStatusLabel(next)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-text-hint">No actions</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-secondary">
            <span>
              Page {page} · {total} total
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
                disabled={page * 40 >= total}
                onClick={() => writeParams({ page: String(page + 1) })}
                className="rounded border border-border px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </AdminTableShell>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-sm font-semibold">Booking detail</h3>
            <p className="mt-1 break-all font-mono text-[11px] text-text-hint">{selected.id}</p>
            <dl className="mt-4 space-y-2 text-xs">
              <Row label="Service">
                <Link
                  href={`/admin/services/${selected.service_id}`}
                  className="text-primary hover:underline"
                >
                  {selected.service?.title || selected.service_id.slice(0, 8)}
                </Link>
              </Row>
              <Row label="Created">{selected.created_at ? formatDateTime(selected.created_at) : "—"}</Row>
              <Row label="Requested appointment">
                {selected.appointment_label || "Not scheduled"}
              </Row>
              <Row label="Completed">
                {selected.completed_at ? formatDateTime(selected.completed_at) : "—"}
              </Row>
              <Row label="Booking status">{formatStatusLabel(selected.status)}</Row>
              <Row label="Payment">{selected.payment?.label || "—"}</Row>
              {selected.finance_tx_id ? (
                <Row label="Finance">
                  <Link
                    href={`/admin/finance/transactions?id=${encodeURIComponent(selected.finance_tx_id)}`}
                    className="text-primary hover:underline"
                  >
                    Open transaction
                  </Link>
                </Row>
              ) : null}
            </dl>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-hint">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
