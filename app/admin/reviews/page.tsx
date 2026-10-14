"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { getSpojexClient } from "@/lib/spojex/client";
import type { ServiceReviewRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type ReviewListRow = ServiceReviewRow & {
  services?: { id: string; title: string } | null;
  reviewer?: { id: string; display_name: string } | null;
  provider?: { id: string; display_name: string } | null;
};

export default function ReviewsPage() {
  const [rows, setRows] = useState<ReviewListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState("all");

  useEffect(() => {
    const load = async () => {
      const client = getSpojexClient();
      const withProvider = await client
        .from("service_reviews")
        .select(
          "*, services:service_id(id, title), reviewer:reviewer_id(id, display_name), provider:provider_id(id, display_name)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (!withProvider.error) {
        setRows((withProvider.data ?? []) as ReviewListRow[]);
        setLoading(false);
        return;
      }
      const withNames = await client
        .from("service_reviews")
        .select("*, services:service_id(id, title), reviewer:reviewer_id(id, display_name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!withNames.error) {
        setRows((withNames.data ?? []) as ReviewListRow[]);
        setLoading(false);
        return;
      }
      const plain = await client
        .from("service_reviews")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (plain.error) setError(plain.error.message);
      else setRows((plain.data ?? []) as ReviewListRow[]);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    if (rating === "all") return rows;
    return rows.filter((row) => String(row.rating) === rating);
  }, [rating, rows]);

  return (
    <>
      <AdminPageHeader
        title="Reviews"
        description="Ratings left after a completed booking"
      />
      <AdminFilterPanel>
        <div className="max-w-xs">
          <AdminSelect value={rating} onChange={setRating}>
            <option value="all">All ratings</option>
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={String(value)}>
                {value} star{value === 1 ? "" : "s"}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading reviews…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title="No reviews"
            description="Reviews appear after a customer completes a booking and rates the provider."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Rating</th>
                  <th className="px-4 py-3 font-semibold">Review</th>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Provider</th>
                  <th className="px-4 py-3 font-semibold">Reviewer</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold">{row.rating}/5</td>
                    <td className="max-w-md px-4 py-3 text-text-secondary">{row.body || "—"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/services/${row.service_id}`} className="text-primary">
                        {row.services?.title || row.service_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${row.provider_id}`} className="text-primary">
                        {row.provider?.display_name || row.provider_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${row.reviewer_id}`} className="text-primary">
                        {row.reviewer?.display_name || row.reviewer_id.slice(0, 8)}
                      </Link>
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
