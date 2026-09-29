"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { firstPayment } from "@/lib/marketplace";
import type { ServiceRequestRow } from "@/lib/types";
import { formatDate, formatMoney, formatStatusLabel } from "@/lib/utils";

const statuses = ["pending", "awaiting_payment", "accepted", "declined", "completed", "cancelled"];

export default function RequestsPage() {
  const [rows, setRows] = useState<ServiceRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const load = async () => {
    const response = await fetch("/api/admin/requests", { credentials: "same-origin" });
    const payload = (await response.json()) as { data?: ServiceRequestRow[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Failed to load bookings");
    setRows(payload.data ?? []);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return [row.message, row.services?.title, row.status, row.requester?.display_name, row.provider?.display_name].some(
        (value) => String(value ?? "").toLowerCase().includes(q),
      );
    });
  }, [query, rows, status]);

  const updateStatus = async (id: string, next: string) => {
    try {
      await patchAdmin(`/api/admin/requests/${id}`, { status: next });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <>
      <AdminPageHeader title="Bookings" description="Anyone can book a published coach, scout, or agent listing." />
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search service, customer, or provider" />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {formatStatusLabel(item)}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading requests…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty title="No requests" description="RLS may hide others' requests unless a service role key is set." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Provider</th>
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Payment</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const payment = firstPayment(row.service_payments);
                  return (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      {row.services ? (
                        <Link href={`/admin/services/${row.services.id}`} className="font-medium text-primary">
                          {row.services.title}
                        </Link>
                      ) : (
                        row.service_id.slice(0, 8)
                      )}
                      {row.location ? (
                        <p className="text-xs text-text-secondary">{row.location}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${row.requester_id}`} className="text-primary">
                        {row.requester?.display_name || row.requester_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${row.provider_id}`} className="text-primary">
                        {row.provider?.display_name || row.provider_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDate(row.requested_at || row.requested_on)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {payment ? (
                        <>
                          <p className="font-medium text-text-primary">
                            {formatMoney(payment.amount, payment.currency)}
                          </p>
                          <p className="text-xs">{formatStatusLabel(payment.status)}</p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone(row.status)}>{formatStatusLabel(row.status)}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={row.status}
                        onChange={(event) => updateStatus(row.id, event.target.value)}
                        className="h-9 rounded-lg border border-border px-2 text-sm"
                      >
                        {statuses.map((item) => (
                          <option key={item} value={item}>
                            {formatStatusLabel(item)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>
    </>
  );
}
