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
import { StatusBadge } from "@/components/status-badge";
import { athleteWithUserSelect } from "@/lib/supabase-embeds";
import { getSupabase } from "@/lib/supabase/client";
import { parseAchievements, parseCareerHistory } from "@/lib/profile-docs";
import type { AthleteProfile, UserRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type AthleteRow = AthleteProfile & { users?: Pick<UserRow, "id" | "display_name" | "city" | "country"> | null };

export default function AthletesPage() {
  const [rows, setRows] = useState<AthleteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSupabase()
      .from("athlete_profiles")
      .select(athleteWithUserSelect)
      .order("updated_at", { ascending: false })
      .limit(500)
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message);
        else setRows((data ?? []) as AthleteRow[]);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <AdminPageHeader title="Athletes" description="Player profiles (athlete_profiles)" />
      {loading ? <AdminLoadingRow label="Loading athletes…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {rows.length === 0 && !loading ? (
          <AdminEmpty title="No athlete profiles" description="Created when a user picks the Player role." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Player</th>
                  <th className="px-4 py-3 font-semibold">Position</th>
                  <th className="px-4 py-3 font-semibold">Level</th>
                  <th className="px-4 py-3 font-semibold">Team</th>
                  <th className="px-4 py-3 font-semibold">Stats</th>
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
                        {row.nationality ? (
                          <p className="text-xs text-text-secondary">{row.nationality}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <p>{row.position || "—"}</p>
                        {row.secondary_position ? (
                          <p className="text-xs text-text-secondary">{row.secondary_position}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{row.playing_level || "—"}</td>
                      <td className="px-4 py-3">{row.team || "—"}</td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {row.matches_played}M · {row.goals}G · {row.assists}A
                        {row.man_of_the_match ? ` · ${row.man_of_the_match} MOTM` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <DocCountBadge label="Career" count={careerCount} />
                          <DocCountBadge label="Awards" count={achievementCount} />
                          {row.looking_for_opportunities ? (
                            <StatusBadge tone="info">Open to opportunities</StatusBadge>
                          ) : null}
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
