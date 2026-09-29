"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import { DocCountBadge } from "@/components/profile-details";
import { mediaWithUserSelect } from "@/lib/supabase-embeds";
import { getSupabase } from "@/lib/supabase/client";
import { parseAchievements, parseCareerHistory } from "@/lib/profile-docs";
import type { MediaProfile, UserRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type Row = MediaProfile & { users?: Pick<UserRow, "id" | "display_name" | "role"> | null };

export default function MediaPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSupabase()
      .from("media_profiles")
      .select(mediaWithUserSelect)
      .order("updated_at", { ascending: false })
      .limit(500)
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message);
        else setRows((data ?? []) as Row[]);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <AdminPageHeader title="Media" description="photographers and journalists (media_profiles)" />
      {loading ? <AdminLoadingRow label="Loading media profiles…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {rows.length === 0 && !loading ? (
          <AdminEmpty title="No media profiles" description="Created when a user picks a media role." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Person</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Outlet</th>
                  <th className="px-4 py-3 font-semibold">Specialty</th>
                  <th className="px-4 py-3 font-semibold">Portfolio</th>
                  <th className="px-4 py-3 font-semibold">Timeline</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const careerCount = parseCareerHistory(row.career_history).length;
                  const achievementCount = parseAchievements(row.achievements).length;
                  return (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${row.id}`} className="font-medium text-primary">
                        {row.users?.display_name || row.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize">{row.users?.role?.replace(/_/g, " ") || "—"}</td>
                    <td className="px-4 py-3">{row.outlet || "—"}</td>
                    <td className="px-4 py-3">{row.specialty || "—"}</td>
                    <td className="px-4 py-3">
                      {row.portfolio_url ? (
                        <a href={row.portfolio_url} className="text-primary" target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <DocCountBadge label="Career" count={careerCount} />
                        <DocCountBadge label="Awards" count={achievementCount} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.updated_at)}</td>
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
