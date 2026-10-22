"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info, Radio, Tv } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import { AdminLoadingRow } from "@/components/admin-layout";
import LiveEventsPanel from "@/components/live-events-panel";
import RadioStreamsPanel from "@/components/radio-streams-panel";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { adminFetch } from "@/lib/hooks";
import { canManageLiveEvents } from "@/lib/live-events";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { cn } from "@/lib/utils";

/** `live` is canonical; `video` is accepted from old bookmarks and links. */
export type StreamsTab = "radio" | "live";

const TABS: { id: StreamsTab; label: string; icon: typeof Radio }[] = [
  { id: "radio", label: "Radio", icon: Radio },
  { id: "live", label: "Live Events", icon: Tv },
];

type Overview = {
  radio?: {
    enabled_stations?: number;
    total_stations?: number;
    health_failures?: number;
    reachable?: number;
    health_unknown?: number;
    definitions?: Record<string, string>;
  };
  live_events?: {
    scheduled_broadcasts?: number;
    confirmed_live_sessions?: number;
    live_source_gaps?: number;
    definitions?: Record<string, string>;
  };
  config_vs_health?: string;
};

function SummaryCard({
  label,
  value,
  hint,
  tooltip,
  tone,
}: {
  label: string;
  value: number | null;
  hint?: string;
  tooltip?: string;
  tone?: "danger";
}) {
  return (
    <div
      className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm"
      title={tooltip}
    >
      <p className="flex items-center gap-1 text-xs font-semibold text-text-secondary">
        <span className="truncate">{label}</span>
        {tooltip ? <Info className="h-3 w-3 shrink-0 text-text-hint" aria-label={tooltip} /> : null}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          tone === "danger" && (value ?? 0) > 0 ? "text-red-600" : "text-text-primary",
        )}
      >
        {value == null ? "-" : value.toLocaleString()}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">{hint}</p> : null}
    </div>
  );
}

function StreamsOverviewCards({ enabled }: { enabled: boolean }) {
  const { data: overview, error } = useAdminQuery<Overview>({
    key: enabled ? adminCacheKey(["streams", "overview"]) : null,
    enabled,
    fetcher: async () => {
      const res = await adminFetch("/api/admin/streams/overview");
      const payload = (await res.json().catch(() => ({}))) as Overview;
      if (!res.ok) throw new Error("overview");
      return payload;
    },
  });

  if (!enabled) return null;
  if (error) {
    return (
      <p className="mb-4 text-xs text-text-secondary">Summary is unavailable right now.</p>
    );
  }

  const radio = overview?.radio;
  const live = overview?.live_events;
  const gaps = live?.live_source_gaps ?? 0;

  return (
    <section aria-label="Streams summary" className="mb-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Enabled radio stations"
          value={radio ? (radio.enabled_stations ?? 0) : null}
          hint={
            radio
              ? `of ${radio.total_stations ?? 0} · listing status, not health`
              : undefined
          }
          tooltip={
            radio?.definitions?.enabled ??
            "Publication status = active (on-air listing). This is not playback health."
          }
        />
        <SummaryCard
          label="Scheduled broadcasts"
          value={live ? (live.scheduled_broadcasts ?? 0) : null}
          hint="Countdown alone does not mean live"
          tooltip={
            live?.definitions?.scheduled ??
            "Status = scheduled. A countdown can reach zero without going live."
          }
        />
        <SummaryCard
          label="Confirmed live sessions"
          value={live ? (live.confirmed_live_sessions ?? 0) : null}
          hint={gaps > 0 ? `${gaps} live without a ready source` : "Explicitly set live by an admin"}
          tooltip={
            live?.definitions?.confirmed_live ??
            "Status = live, set through an explicit go-live action."
          }
        />
        <SummaryCard
          label="Streams with detected failures"
          value={radio ? (radio.health_failures ?? 0) : null}
          hint={
            radio
              ? `${radio.reachable ?? 0} reachable · ${radio.health_unknown ?? 0} unchecked`
              : undefined
          }
          tone="danger"
          tooltip={
            radio?.definitions?.health_failures ??
            "Last health probe reported unreachable or invalid URL (health, not configuration)."
          }
        />
      </div>
    </section>
  );
}

function StreamsHub() {
  const router = useRouter();
  const search = useSearchParams();
  const { can, loading } = useAdminPermissions();
  const canRadio = can("streams:read");
  const canLive = canManageLiveEvents(can);

  const availableTabs = useMemo(
    () => TABS.filter((tab) => (tab.id === "radio" ? canRadio : canLive)),
    [canRadio, canLive],
  );

  const requested = search.get("tab");
  // Backward compat: tab=video is the old name for Live Events.
  const requestedTab: StreamsTab | null =
    requested === "live" || requested === "video"
      ? "live"
      : requested === "radio"
        ? "radio"
        : null;
  const activeTab: StreamsTab =
    requestedTab && availableTabs.some((tab) => tab.id === requestedTab)
      ? requestedTab
      : availableTabs[0]?.id ?? "radio";

  const setTab = (tab: StreamsTab) => {
    router.replace(`/admin/streams?tab=${tab}`, { scroll: false });
  };

  if (loading) {
    return (
      <>
        <AdminPageHeader title="Streams" description="Radio stations and live events" />
        <p className="text-sm text-text-secondary">Checking permissions…</p>
      </>
    );
  }

  if (availableTabs.length === 0) {
    return (
      <>
        <AdminPageHeader title="Streams" description="Radio stations and live events" />
        <p className="text-sm text-text-secondary">You do not have permission to view streams.</p>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Streams"
        description="Radio stations and Live Events (video / audio broadcasts) in one place"
      />

      <StreamsOverviewCards enabled={canRadio} />

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {availableTabs.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "radio" && canRadio ? <RadioStreamsPanel /> : null}
      {activeTab === "live" && canLive ? <LiveEventsPanel /> : null}
    </>
  );
}

export default function StreamsPage() {
  return (
    <Suspense
      fallback={
        <>
          <AdminPageHeader title="Streams" description="Radio stations and live events" />
          <AdminLoadingRow label="Loading streams…" />
        </>
      }
    >
      <StreamsHub />
    </Suspense>
  );
}
