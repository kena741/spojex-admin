"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow, AdminReloadButton } from "@/components/admin-layout";
import {
  EventSettingsPanel,
  LeaderboardPanel,
  PackagesPanel,
  ParticipantsPanel,
  ResultsPanel,
} from "@/components/awards/panels";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { type AwardEventDetail } from "@/lib/awards";
import { adminFetch } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "settings", label: "Event" },
  { id: "participants", label: "Nominees" },
  { id: "packages", label: "Vote packages" },
  { id: "leaderboard", label: "Votes" },
  { id: "results", label: "Winners" },
] as const;

type TabId = (typeof TABS)[number]["id"];

async function loadDetail(id: string): Promise<AwardEventDetail> {
  const res = await adminFetch(`/api/admin/awards/events/${id}`);
  const payload = (await res.json().catch(() => ({}))) as { data?: AwardEventDetail; error?: string };
  if (!res.ok || !payload.data) throw new Error(payload.error || "Could not load the award event");
  return payload.data;
}

export default function AwardEventPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAdminPermissions();
  const canWrite = can("awards:write");
  const canResults = can("awards:results");
  const [tab, setTab] = useState<TabId>("settings");
  const { data, loading, refreshing, error, refresh } = useAdminQuery<AwardEventDetail>({
    key: adminCacheKey(["awards", "event", id]),
    fetcher: () => loadDetail(id),
  });

  return (
    <div>
      <AdminPageHeader
        title={data?.event.title ?? "Award event"}
        backHref="/admin/awards"
        breadcrumbs={[{ label: "Awards & Voting", href: "/admin/awards" }, { label: data?.event.title ?? "Event" }]}
        actions={<AdminReloadButton onClick={refresh} refreshing={refreshing} />}
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {loading && !data ? <AdminLoadingRow label="Loading event…" /> : null}
      {data ? (
        <>
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "settings" ? <EventSettingsPanel event={data.event} canWrite={canWrite} onSaved={refresh} /> : null}
          {tab === "participants" ? <ParticipantsPanel detail={data} canWrite={canWrite} onChanged={refresh} /> : null}
          {tab === "packages" ? <PackagesPanel detail={data} canWrite={canWrite} onChanged={refresh} /> : null}
          {tab === "leaderboard" ? <LeaderboardPanel detail={data} /> : null}
          {tab === "results" ? <ResultsPanel detail={data} canResults={canResults} /> : null}
        </>
      ) : null}
    </div>
  );
}
