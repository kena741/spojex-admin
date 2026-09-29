"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Radio, Tv } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import LiveEventsPanel from "@/components/live-events-panel";
import RadioStreamsPanel from "@/components/radio-streams-panel";
import { canManageLiveEvents } from "@/lib/live-events";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn } from "@/lib/utils";

export type StreamsTab = "radio" | "video";

const TABS: { id: StreamsTab; label: string; icon: typeof Radio }[] = [
  { id: "video", label: "Video", icon: Tv },
  { id: "radio", label: "Radio", icon: Radio },
];

function StreamsHub() {
  const router = useRouter();
  const search = useSearchParams();
  const { can } = useAdminPermissions();
  const canRadio = can("streams:read");
  const canVideo = canManageLiveEvents(can);

  const availableTabs = useMemo(
    () => TABS.filter((tab) => (tab.id === "radio" ? canRadio : canVideo)),
    [canRadio, canVideo],
  );

  const requested = search.get("tab");
  const activeTab: StreamsTab =
    requested === "video" && canVideo
      ? "video"
      : requested === "radio" && canRadio
        ? "radio"
        : availableTabs[0]?.id ?? "radio";

  const setTab = (tab: StreamsTab) => {
    router.replace(`/admin/streams?tab=${tab}`, { scroll: false });
  };

  if (availableTabs.length === 0) {
    return (
      <>
        <AdminPageHeader title="Streams" description="Radio stations and live video" />
        <p className="text-sm text-text-secondary">You do not have permission to view streams.</p>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Streams"
        description="Radio stations and live video events in one place"
      />

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
      {activeTab === "video" && canVideo ? <LiveEventsPanel /> : null}
    </>
  );
}

export default function StreamsPage() {
  return (
    <Suspense
      fallback={
        <>
          <AdminPageHeader title="Streams" description="Radio stations and live video events" />
          <p className="text-sm text-text-secondary">Loading…</p>
        </>
      }
    >
      <StreamsHub />
    </Suspense>
  );
}
