"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  AdminTableShell,
} from "@/components/admin-layout";
import {
  RANGE_PRESETS,
  SURFACE_OPTIONS,
  formatDelta,
  formatMetric,
  type DeliveryHealth,
  type MetricValue,
  type PerformanceReport,
  type PersonalizationReport,
  type PersonalizationUser,
  type UserFeedDetail,
} from "@/lib/feed-insights";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { adminFetch } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { cn, formatDateTime } from "@/lib/utils";

type Tab = "performance" | "personalization" | "delivery";

type FeedInsightsCache =
  | { kind: "performance"; perf: PerformanceReport; fetchedAt: string }
  | {
      kind: "personalization";
      pers: PersonalizationReport;
      detail: UserFeedDetail | null;
      fetchedAt: string;
    }
  | { kind: "delivery"; delivery: DeliveryHealth; fetchedAt: string };

function MetricCard({
  title,
  metric,
  unitHint,
}: {
  title: string;
  metric?: MetricValue | null;
  unitHint?: string;
}) {
  const unavailable = !metric?.available || metric.value == null;
  const delta = formatDelta(metric);
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs text-text-secondary">{title}</p>
      <p className="mt-1 font-heading text-xl font-semibold tabular-nums">
        {formatMetric(metric)}
      </p>
      <p className="mt-0.5 text-[11px] text-text-hint">
        {unavailable
          ? metric?.unavailable_reason || "Not instrumented"
          : unitHint || metric?.unit?.replace(/_/g, " ")}
      </p>
      {delta ? (
        <p className="mt-1 text-[11px] text-text-secondary">{delta}</p>
      ) : null}
      {metric?.definition ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-text-hint">Definition</summary>
          <p className="mt-1 text-[11px] leading-snug text-text-secondary">{metric.definition}</p>
        </details>
      ) : null}
    </div>
  );
}

function ChipList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <span className="text-text-hint">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function AffinityList({
  items,
  empty,
  kind,
}: {
  items: { label?: string; creator_key?: string; score: number; note?: string }[];
  empty: string;
  kind: "positive" | "reduced";
}) {
  if (items.length === 0) return <span className="text-text-hint">{empty}</span>;
  return (
    <div className="space-y-1">
      {items.map((item, i) => {
        const name = item.label || item.creator_key || "-";
        return (
          <div key={`${name}-${i}`} className="text-xs">
            <span className="font-medium">{name}</span>{" "}
            <span
              className={cn(
                "text-text-secondary",
                kind === "reduced" && "text-amber-700 dark:text-amber-400",
              )}
            >
              {item.score.toFixed(2)} · {kind === "reduced" ? "reduced interest" : "positive"}
            </span>
            {item.note ? (
              <p className="text-[10px] text-text-hint">{item.note}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MiniTrend({
  rows,
  valueKey,
  label,
}: {
  rows: { day: string; viewers: number; qualified_views: number; watch_ms: number }[];
  valueKey: "viewers" | "qualified_views" | "watch_ms";
  label: string;
}) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-2 text-xs text-text-hint">No trend data in this period.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-3 flex h-24 items-end gap-0.5">
        {rows.map((r) => {
          const v = Number(r[valueKey]) || 0;
          const h = Math.max(2, Math.round((v / max) * 100));
          return (
            <div
              key={r.day}
              title={`${r.day}: ${v.toLocaleString()}`}
              className="flex-1 rounded-t bg-primary/70"
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-text-hint">
        <span>{rows[0]?.day}</span>
        <span>{rows[rows.length - 1]?.day}</span>
      </div>
    </div>
  );
}

function FeedInsightsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const tab: Tab =
    tabParam === "personalization" || tabParam === "delivery"
      ? tabParam
      : "performance";
  const range = searchParams.get("range") || "30d";
  const customStart = searchParams.get("start") || "";
  const customEnd = searchParams.get("end") || "";
  const surface = searchParams.get("surface") || "for_you";
  const q = searchParams.get("q") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const userId = searchParams.get("user") || "";

  const [searchDraft, setSearchDraft] = useState(q);

  const writeParams = useCallback(
    (patch: Record<string, string | null>, opts?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (opts?.resetPage !== false && !("page" in patch) && "q" in patch) {
        next.delete("page");
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const {
    data: cache,
    loading,
    refreshing,
    error,
    refresh,
  } = useAdminQuery<FeedInsightsCache>({
    key: adminCacheKey([
      "feed-insights",
      tab,
      range,
      customStart,
      customEnd,
      surface,
      q,
      page,
      userId,
    ]),
    fetcher: async () => {
      const fetchedAt = new Date().toISOString();
      if (tab === "performance") {
        const qs = new URLSearchParams();
        qs.set("range", range);
        qs.set("surface", surface);
        if (range === "custom" && customStart && customEnd) {
          qs.set("start", customStart);
          qs.set("end", customEnd);
        }
        const res = await adminFetch(`/api/admin/feed-insights/performance?${qs}`, {
          cache: "no-store",
        });
        const payload = (await res.json()) as PerformanceReport & {
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          throw new Error(payload.message || payload.error || "Failed to load performance");
        }
        return { kind: "performance", perf: payload, fetchedAt };
      }
      if (tab === "personalization") {
        const qs = new URLSearchParams();
        if (q) qs.set("q", q);
        qs.set("page", String(page));
        qs.set("page_size", "40");
        const res = await adminFetch(`/api/admin/feed-insights/personalization?${qs}`, {
          cache: "no-store",
        });
        const payload = (await res.json()) as PersonalizationReport & { message?: string };
        if (!res.ok) {
          throw new Error(payload.message || payload.error || "Failed to load personalization");
        }
        let detail: UserFeedDetail | null = null;
        if (userId) {
          const dres = await adminFetch(
            `/api/admin/feed-insights/users/${encodeURIComponent(userId)}`,
            { cache: "no-store" },
          );
          const dpayload = (await dres.json()) as UserFeedDetail & { message?: string };
          if (!dres.ok) {
            throw new Error(dpayload.message || dpayload.error || "Failed to load user detail");
          }
          detail = dpayload;
        }
        return { kind: "personalization", pers: payload, detail, fetchedAt };
      }
      const res = await adminFetch("/api/admin/feed-insights/delivery", {
        cache: "no-store",
      });
      const payload = (await res.json()) as DeliveryHealth & { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(payload.message || payload.error || "Failed to load delivery health");
      }
      return { kind: "delivery", delivery: payload, fetchedAt };
    },
  });
  const load = refresh;

  const perf = cache?.kind === "performance" ? cache.perf : null;
  const pers = cache?.kind === "personalization" ? cache.pers : null;
  const detail = cache?.kind === "personalization" ? cache.detail : null;
  const delivery = cache?.kind === "delivery" ? cache.delivery : null;
  const updatedAt = cache?.fetchedAt ?? null;

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "performance", label: "Performance" },
    { id: "personalization", label: "Personalization" },
    { id: "delivery", label: "Delivery health" },
  ];

  const summaryCards = useMemo(() => {
    const s = pers?.summary;
    if (!s) return [];
    return [
      {
        title: "Unique users with signals",
        metric: s.unique_users_with_signals,
        unitHint: "distinct users",
      },
      {
        title: "Users with saved preferences",
        metric: s.users_with_saved_preferences,
        unitHint: "distinct users",
      },
      {
        title: "Topic affinity records",
        metric: s.topic_affinity_records,
        unitHint: "records (not users)",
      },
      {
        title: "Creator affinity records",
        metric: s.creator_affinity_records,
        unitHint: "records (not users)",
      },
      {
        title: "Feedback events",
        metric: s.feedback_event_records,
        unitHint: "records",
      },
    ];
  }, [pers]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Feed Insights"
        description="Performance, personalization evidence, and delivery health - read-only; ranking weights are not edited here."
        breadcrumbs={[
          { label: "Content", href: "/admin/content" },
          { label: "Feed Insights" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {updatedAt ? (
              <span className="text-[11px] text-text-hint">
                Updated {formatDateTime(updatedAt)}
                {perf?.timezone || delivery ? ` · ${perf?.timezone || "Africa/Addis_Ababa"}` : ""}
              </span>
            ) : null}
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => void load()}
              label="Refresh"
            />
          </div>
        }
      />

      <div className="flex flex-wrap gap-1 border-b border-border pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => writeParams({ tab: t.id === "performance" ? null : t.id }, { resetPage: false })}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-text-secondary hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AdminFilterPanel>
        <div className="flex flex-wrap items-end gap-3">
          {tab === "performance" ? (
            <>
              <div>
                <label className="mb-1 block text-[11px] text-text-hint">Date range</label>
                <AdminSelect
                  value={range}
                  onChange={(v) => writeParams({ range: v, start: null, end: null })}
                >
                  {RANGE_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </AdminSelect>
              </div>
              {range === "custom" ? (
                <>
                  <div>
                    <label className="mb-1 block text-[11px] text-text-hint">Start</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => writeParams({ start: e.target.value || null })}
                      className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-text-hint">End</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => writeParams({ end: e.target.value || null })}
                      className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
                    />
                  </div>
                </>
              ) : null}
              <div>
                <label className="mb-1 block text-[11px] text-text-hint">Surface</label>
                <AdminSelect
                  value={surface}
                  onChange={(v) => writeParams({ surface: v })}
                >
                  {SURFACE_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </AdminSelect>
              </div>
            </>
          ) : null}
          {tab === "personalization" ? (
            <div className="flex min-w-[220px] flex-1 flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-[11px] text-text-hint">Search users</label>
                <AdminSearchInput
                  value={searchDraft}
                  onChange={setSearchDraft}
                  placeholder="User, username, or id"
                />
              </div>
              <button
                type="button"
                onClick={() => writeParams({ q: searchDraft.trim() || null, page: null })}
                className="h-10 rounded-lg border border-border bg-card px-3 text-xs font-medium"
              >
                Search
              </button>
            </div>
          ) : null}
          <p className="text-[11px] text-text-hint max-w-md">
            {tab === "personalization"
              ? "Personalization values are current snapshots - not historical state for a date range."
              : tab === "performance"
                ? "Metrics count events/exposures in the selected period. Prefetch is not an impression."
                : "Worker health from outbox and processing delay - events existing ≠ healthy workers."}
          </p>
        </div>
      </AdminFilterPanel>

      {loading && !cache ? <AdminLoadingRow label="Loading feed insights…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      {tab === "performance" && perf ? (
        <div className="space-y-4">
          {perf.period?.note ? (
            <p className="text-xs text-text-secondary">{perf.period.note}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <MetricCard title="Unique feed viewers" metric={perf.metrics?.unique_viewers} unitHint="distinct users" />
            <MetricCard title="Impressions" metric={perf.metrics?.impressions} unitHint="visible exposures" />
            <MetricCard title="Qualified views" metric={perf.metrics?.qualified_views} unitHint="viewed exposures" />
            <MetricCard title="Watch time" metric={perf.metrics?.watch_time_ms} />
            <MetricCard title="Avg watch / qualified view" metric={perf.metrics?.avg_watch_ms_per_qualified_view} />
            <MetricCard title="Video completion rate" metric={perf.metrics?.video_completion_rate} unitHint="video posts only" />
            <MetricCard title="Likes (period)" metric={perf.metrics?.likes} />
            <MetricCard title="Comments (period)" metric={perf.metrics?.comments} />
            <MetricCard title="Saves (period)" metric={perf.metrics?.saves} />
            <MetricCard title="Shares (period)" metric={perf.metrics?.shares} />
            <MetricCard title="Not interested" metric={perf.metrics?.not_interested_count} unitHint="feedback records" />
            <MetricCard title="Not interested rate" metric={perf.metrics?.not_interested_rate} />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <MiniTrend rows={perf.trends ?? []} valueKey="viewers" label="Viewers over time" />
            <MiniTrend rows={perf.trends ?? []} valueKey="qualified_views" label="Qualified views" />
            <MiniTrend rows={perf.trends ?? []} valueKey="watch_ms" label="Watch time (ms)" />
          </div>

          {(perf.gaps?.length ?? 0) > 0 ? (
            <details className="rounded-xl border border-amber-200/60 bg-amber-50/40 px-4 py-3 text-xs dark:border-amber-900/40 dark:bg-amber-950/20">
              <summary className="cursor-pointer font-medium">
                Instrumentation gaps ({perf.gaps!.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-text-secondary">
                {perf.gaps!.map((g) => (
                  <li key={g.code}>{g.message}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <AdminTableShell>
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Content performance</h2>
              <p className="text-xs text-text-hint">
                Low-exposure rows are labeled - small sample sizes are not strong evidence.
              </p>
            </div>
            {(perf.content?.length ?? 0) === 0 ? (
              <AdminEmpty
                title="No content exposures in period"
                description="Visible or viewed exposures will appear here once clients report them."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 font-medium">Content</th>
                      <th className="px-4 py-3 font-medium">Org</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Exposures</th>
                      <th className="px-4 py-3 font-medium">Qualified views</th>
                      <th className="px-4 py-3 font-medium">Watch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {perf.content!.map((row) => (
                      <tr key={row.content_id} className="align-top">
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            {row.thumbnail_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.thumbnail_url}
                                alt=""
                                className="h-12 w-12 shrink-0 rounded-md object-cover bg-muted"
                              />
                            ) : (
                              <div className="h-12 w-12 shrink-0 rounded-md bg-muted" />
                            )}
                            <div>
                              <Link
                                href={row.href}
                                className="font-medium text-primary hover:underline"
                              >
                                {row.title}
                              </Link>
                              {row.low_exposure ? (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                                  {row.evidence_note || "Low exposure"}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">
                          {row.organization_name || "-"}
                        </td>
                        <td className="px-4 py-3 text-xs capitalize">{row.media_type}</td>
                        <td className="px-4 py-3 tabular-nums">{row.exposures}</td>
                        <td className="px-4 py-3 tabular-nums">{row.qualified_views}</td>
                        <td className="px-4 py-3 text-xs tabular-nums text-text-secondary">
                          {formatMetric({
                            value: row.watch_ms,
                            unit: "milliseconds",
                            definition: "",
                            available: true,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminTableShell>
        </div>
      ) : null}

      {tab === "personalization" && pers ? (
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">{pers.snapshot_note}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {summaryCards.map((c) => (
              <MetricCard key={c.title} title={c.title} metric={c.metric} unitHint={c.unitHint} />
            ))}
          </div>

          <details className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-text-secondary">
            <summary className="cursor-pointer font-medium text-foreground">Score & taxonomy notes</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>
                Negative affinity reduces ranking weight - it does{" "}
                <strong>not</strong> hard-exclude content. Hard exclusion uses feedback + exposure windows.
              </li>
              <li>
                Raw scores are uncalibrated weights, not probabilities or percentages.
              </li>
              {pers.taxonomy_note?.general ? <li>{pers.taxonomy_note.general}</li> : null}
              {pers.score_policy?.hard_exclusion ? (
                <li>Hard exclusion: {pers.score_policy.hard_exclusion}</li>
              ) : null}
            </ul>
          </details>

          <div className={cn("grid gap-4", userId ? "lg:grid-cols-[1fr_360px]" : "")}>
            <AdminTableShell>
              {(pers.users?.length ?? 0) === 0 ? (
                <AdminEmpty
                  title="No personalization signals"
                  description="Preferences and affinities appear after users interact with the For You feed."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-medium">User</th>
                        <th className="px-4 py-3 font-medium">Explicit interests</th>
                        <th className="px-4 py-3 font-medium">Languages</th>
                        <th className="px-4 py-3 font-medium">Positive topics</th>
                        <th className="px-4 py-3 font-medium">Reduced topics</th>
                        <th className="px-4 py-3 font-medium">Creators</th>
                        <th className="px-4 py-3 font-medium">Feedback</th>
                        <th className="px-4 py-3 font-medium">Last signal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pers.users!.map((row: PersonalizationUser) => {
                        const label =
                          row.user?.display_name ||
                          (row.user?.username ? `@${row.user.username}` : null) ||
                          row.user_id.slice(0, 8);
                        const selected = userId === row.user_id;
                        return (
                          <tr
                            key={row.user_id}
                            className={cn("align-top", selected && "bg-muted/40")}
                          >
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                className="text-left font-medium text-primary hover:underline"
                                onClick={() =>
                                  writeParams(
                                    { user: selected ? null : row.user_id },
                                    { resetPage: false },
                                  )
                                }
                              >
                                {label}
                              </button>
                              {row.user?.username ? (
                                <p className="text-xs text-text-secondary">@{row.user.username}</p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              <ChipList
                                items={row.explicit_interests}
                                empty={
                                  row.explicit_interests_label ||
                                  (row.has_preference_row
                                    ? "No explicit preferences"
                                    : "Preferences not set")
                                }
                              />
                            </td>
                            <td className="px-4 py-3">
                              <ChipList
                                items={row.preferred_languages}
                                empty={row.languages_label || "-"}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <AffinityList
                                items={row.positive_topics}
                                empty="-"
                                kind="positive"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <AffinityList
                                items={row.reduced_topics}
                                empty="-"
                                kind="reduced"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-2">
                                <AffinityList
                                  items={row.positive_creators}
                                  empty="No positive"
                                  kind="positive"
                                />
                                {(row.reduced_creators?.length ?? 0) > 0 ? (
                                  <AffinityList
                                    items={row.reduced_creators}
                                    empty=""
                                    kind="reduced"
                                  />
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary">
                              {row.feedback_total === 0
                                ? "-"
                                : Object.entries(row.feedback)
                                    .map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`)
                                    .join(" · ")}
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                              {row.last_signal_at ? formatDateTime(row.last_signal_at) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {(pers.total ?? 0) > (pers.page_size ?? 40) ? (
                <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs">
                  <span className="text-text-secondary">
                    Page {pers.page} · {pers.total} users
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => writeParams({ page: String(page - 1) }, { resetPage: false })}
                      className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={!pers.has_more}
                      onClick={() => writeParams({ page: String(page + 1) }, { resetPage: false })}
                      className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </AdminTableShell>

            {userId && detail ? (
              <aside className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-heading text-base font-semibold">
                      {detail.user?.display_name ||
                        (detail.user?.username ? `@${detail.user.username}` : "User")}
                    </h3>
                    <p className="text-xs text-text-hint">Feed diagnostics · current snapshot</p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-text-secondary hover:underline"
                    onClick={() => writeParams({ user: null }, { resetPage: false })}
                  >
                    Close
                  </button>
                </div>
                {detail.profile_href ? (
                  <Link href={detail.profile_href} className="text-xs font-medium text-primary hover:underline">
                    Open account profile
                  </Link>
                ) : null}

                <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-text-secondary space-y-1">
                  {detail.state?.no_preference_record ? <p>Preferences not set (no saved record).</p> : null}
                  {detail.state?.no_explicit_preferences ? <p>No explicit preferences (empty interests).</p> : null}
                  {detail.state?.no_behavioral_history ? <p>No behavioral history yet.</p> : null}
                  {detail.state?.affinities_present ? <p>Affinities have been updated from signals.</p> : null}
                  {detail.state?.why_this_appeared_note ? (
                    <p className="text-text-hint">{detail.state.why_this_appeared_note}</p>
                  ) : null}
                </div>

                <section>
                  <h4 className="text-xs font-semibold uppercase text-text-secondary">Recent signals</h4>
                  {(detail.events?.length ?? 0) === 0 ? (
                    <p className="mt-1 text-xs text-text-hint">No recent feed events.</p>
                  ) : (
                    <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs">
                      {detail.events!.map((e) => (
                        <li key={e.event_id} className="border-b border-border/60 pb-2">
                          <span className="font-medium">{e.event_type}</span>
                          {e.content_key ? (
                            <span className="text-text-secondary"> · {e.content_key}</span>
                          ) : null}
                          <p className="text-text-hint">
                            {e.occurred_at ? formatDateTime(e.occurred_at) : "-"}
                            {e.active_watch_ms_total != null
                              ? ` · watch ${e.active_watch_ms_total} ms`
                              : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h4 className="text-xs font-semibold uppercase text-text-secondary">Negative feedback</h4>
                  {(detail.feedback?.length ?? 0) === 0 ? (
                    <p className="mt-1 text-xs text-text-hint">None recorded.</p>
                  ) : (
                    <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
                      {detail.feedback!.map((f) => (
                        <li key={f.id}>
                          <span className="font-medium">{f.action.replace(/_/g, " ")}</span>
                          {f.content_key ? ` · ${f.content_key}` : ""}
                          <span className="text-text-hint">
                            {" "}
                            · {f.created_at ? formatDateTime(f.created_at) : "-"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h4 className="text-xs font-semibold uppercase text-text-secondary">Recent sessions</h4>
                  {(detail.sessions?.length ?? 0) === 0 ? (
                    <p className="mt-1 text-xs text-text-hint">No sessions stored.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                      {detail.sessions!.map((s) => (
                        <li key={s.id}>
                          {s.last_active_at ? formatDateTime(s.last_active_at) : s.id.slice(0, 8)}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </aside>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "delivery" && delivery ? (
        <div className="space-y-4">
          {delivery.stale_warning ? (
            <AdminErrorAlert message={delivery.stale_warning} />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <p className="text-xs text-text-secondary">Ranking / serving version</p>
              <p className="mt-1 font-heading text-lg font-semibold">
                {delivery.ranking_version || "-"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <p className="text-xs text-text-secondary">Outbox pending</p>
              <p className="mt-1 font-heading text-xl font-semibold tabular-nums">
                {delivery.outbox?.available
                  ? (delivery.outbox.pending ?? 0).toLocaleString()
                  : "Unavailable"}
              </p>
              <p className="text-[11px] text-text-hint">
                {delivery.outbox?.note || "Worker backlog"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <p className="text-xs text-text-secondary">Outbox failed / retrying</p>
              <p className="mt-1 font-heading text-xl font-semibold tabular-nums">
                {delivery.outbox?.available
                  ? (delivery.outbox.failed ?? 0).toLocaleString()
                  : "Unavailable"}
              </p>
              {delivery.outbox?.oldest_pending_at ? (
                <p className="text-[11px] text-text-hint">
                  Oldest pending {formatDateTime(delivery.outbox.oldest_pending_at)}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <p className="text-xs text-text-secondary">Last successful outbox process</p>
              <p className="mt-1 text-sm font-medium">
                {delivery.outbox?.last_processed_at
                  ? formatDateTime(delivery.outbox.last_processed_at)
                  : "-"}
              </p>
            </div>
            <MetricCard title="Event processing delay (24h avg)" metric={delivery.processing_delay} />
            <MetricCard title="Empty sessions (24h)" metric={delivery.empty_sessions_24h} />
            <MetricCard title="Request success rate" metric={delivery.request_metrics?.success_rate} />
            <MetricCard title="Response latency" metric={delivery.request_metrics?.latency_ms} />
            <MetricCard
              title="Pagination failures"
              metric={delivery.request_metrics?.pagination_failures}
            />
            <MetricCard
              title="Duplicate items in session"
              metric={delivery.request_metrics?.duplicate_in_session}
            />
          </div>

          <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-text-secondary">
            <p className="font-medium text-foreground">Guest vs authenticated</p>
            <p className="mt-1">{delivery.guest_vs_authenticated?.note}</p>
            <p className="mt-1 text-text-hint">
              Authenticated instrumented:{" "}
              {delivery.guest_vs_authenticated?.authenticated_instrumented ? "yes" : "no"}
              {" · "}
              Guest instrumented:{" "}
              {delivery.guest_vs_authenticated?.guest_instrumented ? "yes" : "no"}
            </p>
          </div>

          {(delivery.gaps?.length ?? 0) > 0 ? (
            <details className="rounded-xl border border-amber-200/60 bg-amber-50/40 px-4 py-3 text-xs dark:border-amber-900/40 dark:bg-amber-950/20">
              <summary className="cursor-pointer font-medium">
                Gaps ({delivery.gaps!.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {delivery.gaps!.map((g) => (
                  <li key={g.code}>{g.message}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function FeedInsightsPage() {
  return (
    <Suspense fallback={<AdminLoadingRow label="Loading feed insights…" />}>
      <FeedInsightsPageInner />
    </Suspense>
  );
}
