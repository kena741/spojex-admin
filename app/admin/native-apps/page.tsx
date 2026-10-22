"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Dumbbell,
  HeartHandshake,
  Radio,
  RefreshCw,
} from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn, formatDateTime } from "@/lib/utils";

type Metric = {
  value: number | null;
  available?: boolean;
  note?: string | null;
  kind?: string;
  href?: string | null;
  definition?: string | null;
  previous?: number | null;
  delta_pct?: number | null;
  amount?: string | null;
};

type ModuleBlock = {
  available?: boolean;
  error?: string;
  href?: string;
  primary?: Metric;
  primary_label?: string;
  metrics?: Record<string, Metric>;
  queue?: { key: string; count: number } | null;
  partial_errors?: Record<string, string>;
};

type PreviewItem = {
  id?: string;
  name?: string;
  state?: string;
  at?: string | null;
  href?: string;
};

type OverviewPayload = {
  modules?: Record<string, ModuleBlock>;
  attention?: {
    key: string;
    label: string;
    count: number;
    href: string;
    scope?: string;
  }[];
  previews?: Record<string, { available?: boolean; items?: PreviewItem[]; error?: string }>;
  trends?: {
    available?: boolean;
    series?: Record<
      string,
      {
        available?: boolean;
        points?: { day: string; count: number }[];
        low_volume?: boolean;
        label?: string;
        note?: string;
        error?: string;
      }
    >;
  };
  operational_summary?: Record<string, Metric | null | undefined>;
  period?: {
    label?: string;
    range?: string;
    start_date?: string;
    end_date?: string;
    timezone?: string;
    upcoming_days?: number;
    note?: string;
  };
  definitions?: Record<string, string>;
  section_errors?: Record<string, string>;
  generated_at?: string;
  error?: string;
};

function MetricValue({ metric }: { metric?: Metric }) {
  if (!metric || metric.available === false || metric.value == null) {
    return (
      <p className="text-sm text-text-hint" title={metric?.note || undefined}>
        {metric?.note ? "Unavailable" : "-"}
      </p>
    );
  }
  return (
    <p className="font-heading text-xl font-semibold tabular-nums">
      {new Intl.NumberFormat("en-US").format(metric.value)}
    </p>
  );
}

function KindBadge({ kind }: { kind?: string }) {
  if (!kind) return null;
  const label =
    kind === "snapshot" ? "Snapshot" : kind === "period" ? "Period" : kind === "upcoming" ? "Upcoming" : kind;
  return (
    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-hint">
      {label}
    </span>
  );
}

function Delta({ metric }: { metric?: Metric }) {
  if (!metric || metric.previous == null || metric.delta_pct == null) return null;
  const up = metric.delta_pct >= 0;
  return (
    <span className={cn("text-[11px] font-medium", up ? "text-emerald-700" : "text-red-700")}>
      {up ? "+" : ""}
      {metric.delta_pct}% vs prior
    </span>
  );
}

const MODULE_META: Record<
  string,
  { title: string; icon: typeof Building2; permission: string | string[] }
> = {
  stadiums: { title: "Stadiums", icon: Building2, permission: "stadiums:read" },
  gyms: { title: "Gyms", icon: Dumbbell, permission: "gyms:read" },
  events: { title: "Events", icon: CalendarDays, permission: "events:read" },
  donations: { title: "Donations", icon: HeartHandshake, permission: "donations:read" },
  streams: { title: "Streams", icon: Radio, permission: ["streams:read", "events:read"] },
};

const SECONDARY_KEYS: Record<string, string[]> = {
  stadiums: ["pending_approvals", "added_period", "booking_activity"],
  gyms: ["pending_verification", "pending_feature", "membership_activity"],
  events: ["sales_open", "verified_tickets_sold", "checkins"],
  donations: ["contributions_period", "closing_soon", "progress_to_targets"],
  streams: ["video_live_confirmed", "video_scheduled", "radio_playback_health"],
};

const SECONDARY_LABELS: Record<string, string> = {
  pending_approvals: "Pending approvals",
  added_period: "Added in period",
  booking_activity: "Booking activity",
  pending_verification: "Verification queue",
  pending_feature: "Feature requests",
  membership_activity: "Membership activity",
  sales_open: "Sales open",
  verified_tickets_sold: "Verified tickets sold",
  checkins: "Check-ins",
  contributions_period: "Contributions (period)",
  closing_soon: "Closing soon",
  progress_to_targets: "Progress to targets",
  video_live_confirmed: "Confirmed live video",
  video_scheduled: "Scheduled streams",
  radio_playback_health: "Playback health",
  radio_enabled: "Enabled stations",
};

export default function NativeAppsOverviewPage() {
  const { can, loading: permsLoading } = useAdminPermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "30d";
  const start = searchParams.get("start") || "";
  const end = searchParams.get("end") || "";

  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const writeParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      const id = ++requestId.current;
      if (opts?.soft) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("range", range);
        if (range === "custom" && start && end) {
          params.set("start", start);
          params.set("end", end);
        }
        const res = await fetch(`/api/admin/native-apps/overview?${params}`, {
          cache: "no-store",
        });
        const payload = (await res.json()) as OverviewPayload;
        if (id !== requestId.current) return;
        if (!res.ok) throw new Error(payload.error || "Failed to load overview");
        setData(payload);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [range, start, end],
  );

  useEffect(() => {
    if (permsLoading) return;
    void load();
  }, [load, permsLoading]);

  const modules = data?.modules ?? {};
  const attention = data?.attention ?? [];
  const previews = data?.previews ?? {};
  const trends = data?.trends?.series ?? {};

  const canModule = (key: string) => {
    const meta = MODULE_META[key];
    if (!meta) return false;
    const perms = Array.isArray(meta.permission) ? meta.permission : [meta.permission];
    return perms.some((p) => can(p));
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Native Apps"
        description="Operations hub for venues, gyms, events, donations, and streams"
        actions={
          <button
            type="button"
            onClick={() => void load({ soft: true })}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </button>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <label className="grid gap-1 text-xs">
          <span className="text-text-hint">Historical period</span>
          <select
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
            value={range === "custom" ? "custom" : range}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "custom") writeParams({ range: "custom" });
              else writeParams({ range: v, start: null, end: null });
            }}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {range === "custom" ? (
          <>
            <label className="grid gap-1 text-xs">
              <span className="text-text-hint">From</span>
              <input
                type="date"
                className="h-9 rounded-lg border border-border px-2 text-sm"
                value={start}
                onChange={(e) => writeParams({ start: e.target.value || null, range: "custom" })}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-text-hint">To</span>
              <input
                type="date"
                className="h-9 rounded-lg border border-border px-2 text-sm"
                value={end}
                onChange={(e) => writeParams({ end: e.target.value || null, range: "custom" })}
              />
            </label>
          </>
        ) : null}
        <p className="ml-auto text-[11px] text-text-hint">
          {data?.period?.label ? `${data.period.label} · ${data.period.timezone}` : null}
          {data?.generated_at ? ` · Updated ${formatDateTime(data.generated_at)}` : null}
        </p>
      </div>
      <p className="text-[11px] text-text-hint">
        {data?.period?.note ||
          "Snapshot metrics are current state. Period metrics use Africa/Addis_Ababa day boundaries. Upcoming windows are independent of the historical period."}
      </p>

      {error ? (
        <div className="space-y-2">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading || permsLoading ? <AdminLoadingRow label="Loading Native Apps overview…" /> : null}

      {!loading && !permsLoading ? (
        <>
          {/* Needs attention */}
          <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-800" />
              <h2 className="font-heading text-sm font-semibold text-amber-950">Needs attention</h2>
            </div>
            {attention.length === 0 ? (
              <p className="text-sm text-amber-900/80">Nothing needs attention.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {attention.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm hover:border-amber-300"
                    >
                      <span>
                        <span className="font-medium">{item.label}</span>
                        {item.scope ? (
                          <span className="mt-0.5 block text-[11px] text-text-hint">{item.scope}</span>
                        ) : null}
                      </span>
                      <span className="font-semibold tabular-nums text-amber-900">{item.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Module performance */}
          <section>
            <h2 className="mb-3 font-heading text-sm font-semibold">Module performance</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Object.keys(MODULE_META).filter(canModule).map((key) => {
                const meta = MODULE_META[key];
                const block = modules[key];
                const Icon = meta.icon;
                if (!block || block.available === false) {
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-dashed border-border bg-card p-4"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Icon className="h-4 w-4 text-text-hint" />
                        <h3 className="font-heading text-sm font-semibold">{meta.title}</h3>
                      </div>
                      <p className="text-sm text-text-hint">
                        {block?.error || data?.section_errors?.[key] || "Module unavailable"}
                      </p>
                      <button
                        type="button"
                        onClick={() => void load({ soft: true })}
                        className="mt-2 text-xs font-medium text-primary hover:underline"
                      >
                        Retry
                      </button>
                    </div>
                  );
                }
                const secondary = (SECONDARY_KEYS[key] || [])
                  .map((k) => ({ key: k, metric: block.metrics?.[k] }))
                  .filter((x) => x.metric);
                return (
                  <article
                    key={key}
                    className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-text-secondary" />
                        <h3 className="font-heading text-sm font-semibold">{meta.title}</h3>
                      </div>
                      <Link
                        href={block.href || `/admin/${key === "streams" ? "streams" : key}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        View module
                      </Link>
                    </div>
                    <div className="mb-3">
                      <div className="flex items-center gap-2 text-[11px] text-text-hint">
                        <span className="uppercase tracking-wide">
                          {block.primary_label || "Primary"}
                        </span>
                        <KindBadge kind={block.primary?.kind} />
                      </div>
                      {block.primary?.href ? (
                        <Link href={block.primary.href} className="hover:text-primary">
                          <MetricValue metric={block.primary} />
                        </Link>
                      ) : (
                        <MetricValue metric={block.primary} />
                      )}
                      <Delta metric={block.primary} />
                    </div>
                    <dl className="mt-auto space-y-2 border-t border-border pt-3">
                      {secondary.map(({ key: sk, metric }) => (
                        <div key={sk} className="flex items-start justify-between gap-2">
                          <dt className="text-[11px] text-text-hint">
                            {SECONDARY_LABELS[sk] || sk}
                            <span className="ml-1">
                              <KindBadge kind={metric?.kind} />
                            </span>
                          </dt>
                          <dd className="text-right">
                            {metric?.href && metric.available !== false && metric.value != null ? (
                              <Link
                                href={metric.href}
                                className="text-sm font-semibold tabular-nums text-primary hover:underline"
                                title={metric.definition || metric.note || undefined}
                              >
                                {new Intl.NumberFormat("en-US").format(metric.value)}
                              </Link>
                            ) : (
                              <span
                                className="text-sm text-text-hint"
                                title={metric?.note || undefined}
                              >
                                {metric?.available === false
                                  ? "Unavailable"
                                  : metric?.value != null
                                    ? new Intl.NumberFormat("en-US").format(metric.value)
                                    : "-"}
                              </span>
                            )}
                            <div>
                              <Delta metric={metric} />
                            </div>
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {block.queue && block.queue.count > 0 ? (
                      <p className="mt-3 text-[11px] font-medium text-amber-800">
                        Queue: {block.queue.count} need review
                      </p>
                    ) : null}
                    {block.partial_errors && Object.keys(block.partial_errors).length > 0 ? (
                      <p className="mt-2 text-[11px] text-amber-800">
                        Partial: {Object.values(block.partial_errors).join("; ")}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          {/* Upcoming and recent */}
          <section>
            <h2 className="mb-3 font-heading text-sm font-semibold">Upcoming and recent activity</h2>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Upcoming events",
                  metric: data?.operational_summary?.upcoming_events_14d,
                },
                {
                  label: "Active campaigns",
                  metric: data?.operational_summary?.active_campaigns,
                },
                {
                  label: "Enabled radio",
                  metric: data?.operational_summary?.enabled_radio,
                },
                {
                  label: "Confirmed live video",
                  metric: data?.operational_summary?.video_live,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-border bg-card p-3 shadow-sm"
                >
                  <p className="text-[11px] uppercase tracking-wide text-text-hint">{item.label}</p>
                  {item.metric?.href && item.metric.value != null ? (
                    <Link href={item.metric.href} className="hover:text-primary">
                      <MetricValue metric={item.metric} />
                    </Link>
                  ) : (
                    <MetricValue metric={item.metric || undefined} />
                  )}
                  <KindBadge kind={item.metric?.kind} />
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {(
                [
                  ["gym_reviews", "Gym / stadium reviews awaiting action"],
                  ["stadium_reviews", "Stadium approvals awaiting action"],
                  ["events_starting_soon", "Events starting soon"],
                  ["campaigns_closing_soon", "Active campaigns (recent)"],
                ] as const
              ).map(([key, title]) => {
                const block = previews[key] as
                  | { available?: boolean; items?: PreviewItem[]; error?: string; note?: string }
                  | undefined;
                return (
                  <div key={key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <h3 className="mb-2 text-sm font-semibold">{title}</h3>
                    {block?.note ? (
                      <p className="mb-2 text-[11px] text-text-hint">{block.note}</p>
                    ) : null}
                    {!block?.available ? (
                      <p className="text-sm text-text-hint">{block?.error || "Unavailable"}</p>
                    ) : !(block.items && block.items.length) ? (
                      <p className="text-sm text-text-hint">No items in this preview.</p>
                    ) : (
                      <ul className="space-y-2">
                        {block.items.map((item) => (
                          <li
                            key={item.id || item.name}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{item.name}</p>
                              <p className="text-[11px] text-text-hint">
                                {[item.state, item.at ? formatDateTime(item.at) : null]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                            {item.href ? (
                              <Link
                                href={item.href}
                                className="shrink-0 text-xs font-medium text-primary hover:underline"
                              >
                                Open
                              </Link>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Trends */}
          <section>
            <h2 className="mb-3 font-heading text-sm font-semibold">Trends (period)</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {Object.entries(trends).map(([key, series]) => (
                <div key={key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <h3 className="mb-2 text-sm font-semibold">
                    {series.label || key.replace(/_/g, " ")}
                  </h3>
                  {!series.available ? (
                    <p className="text-sm text-text-hint">{series.error || series.note || "Unavailable"}</p>
                  ) : !series.points?.length ? (
                    <p className="text-sm text-text-hint">No activity in this period.</p>
                  ) : series.low_volume ? (
                    <div>
                      <p className="mb-2 text-xs text-text-hint">
                        Low volume - showing daily counts instead of a chart.
                      </p>
                      <ul className="max-h-40 space-y-1 overflow-auto text-xs">
                        {series.points.map((p) => (
                          <li key={p.day} className="flex justify-between tabular-nums">
                            <span>{p.day}</span>
                            <span>{p.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <MiniBars points={series.points} />
                  )}
                </div>
              ))}
            </div>
          </section>

          {data?.definitions ? (
            <details className="text-xs text-text-hint">
              <summary className="cursor-pointer font-medium">Metric definitions</summary>
              <ul className="mt-2 space-y-1">
                {Object.entries(data.definitions).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-medium text-text-secondary">{k}:</span> {v}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function MiniBars({ points }: { points: { day: string; count: number }[] }) {
  const max = Math.max(...points.map((p) => p.count), 1);
  return (
    <div className="flex h-28 items-end gap-1">
      {points.map((p) => (
        <div key={p.day} className="flex flex-1 flex-col items-center gap-1" title={`${p.day}: ${p.count}`}>
          <div
            className="w-full rounded-t bg-primary/80"
            style={{ height: `${Math.max(8, (p.count / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
