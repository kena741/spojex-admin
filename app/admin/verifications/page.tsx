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
import { getSupabase } from "@/lib/supabase/client";
import type { IdentityVerificationRequestRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { verificationStatusLabel, verificationStatuses } from "@/lib/verification";

export default function VerificationsPage() {
  const [rows, setRows] = useState<IdentityVerificationRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("pending");

  const load = async () => {
    const { data, error: loadError } = await getSupabase()
      .from("identity_verification_requests")
      .select("*, users!identity_verification_requests_user_id_fkey(id, display_name, full_name, role, avatar_url, verified)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (loadError) throw loadError;
    setRows((data ?? []) as IdentityVerificationRequestRow[]);
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
      const person = row.users;
      return [person?.display_name, person?.full_name, person?.role, row.user_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [query, rows, status]);

  return (
    <>
      <AdminPageHeader
        title="Verifications"
        description="Review National ID and professional documents, then approve or reject."
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name or role" />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            {verificationStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading verification requests…" /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title="No requests"
            description="When a user uploads National ID photos, they appear here for review."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/verifications/${row.id}`}
                        className="font-medium text-text-primary hover:text-primary"
                      >
                        {row.users?.display_name || row.users?.full_name || "Unnamed"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{row.users?.role || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone(row.status)}>
                        {verificationStatusLabel(row.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>
    </>
  );
}
