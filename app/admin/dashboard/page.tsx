"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  ExternalLink,
  HelpCircle,
  RefreshCw,
  X,
} from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert } from "@/components/admin-layout";
import { AnalyticsDateFilter } from "@/components/analytics/date-range-filter";
import { ChartCard, DualLineChart, SeriesAreaChart, SimpleBarChart } from "@/components/analytics/charts";
import { KpiCard, KpiSkeleton } from "@/components/analytics/kpi-card";
import {
  ANALYTICS_TZ,
  exportAnalyticsUrl,
  fetchAnalytics,
  fetchContentDetail,
  formatCompact,
  parseRangeFromSearch,
  type AnalyticsQuery,
  type RangeKey,
} from "@/lib/analytics";
import { cn } from "@/lib/utils";

type TabKey = "overview" | "users" | "gyms" | "content";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "User Growth" },
  { key: "gyms", label: "Gym Growth" },
  { key: "content", label: "Content Performance" },
];

const CONTENT_TABS = [
  { key: "trending_now", label: "Trending Now" },
  { key: "most_viewed", label: "Most Viewed" },
  { key: "most_shared", label: "Most Shared" },
  { key: "highest_engagement", label: "Highest Engagement" },
  { key: "highest_completion", label: "Highest Completion" },
];

function mergeSeries(
  a: { date: string; value: number }[],
  b: { date: string; value: number }[],
  aKey: string,
  bKey: string,
) {
  const map = new Map<string, Record<string, string | number>>();
  for (const p of a) map.set(p.date, { date: p.date, [aKey]: p.value, [bKey]: 0 });
  for (const p of b) {
    const cur = map.get(p.date) || { date: p.date, [aKey]: 0 };
    cur[bKey] = p.value;
    map.set(p.date, cur);
  }
  return Array.from(map.values()).sort((x, y) => String(x.date).localeCompare(String(y.date)));
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const section = (searchParams.get("section") as TabKey) || "overview";
  const activeTab: TabKey = TABS.some((t) => t.key === section) ? section : "overview";
  const query = useMemo(() => parseRangeFromSearch(searchParams), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Record<string, any> | null>(null);
  const [users, setUsers] = useState<Record<string, any> | null>(null);
  const [gyms, setGyms] = useState<Record<string, any> | null>(null);
  const [content, setContent] = useState<Record<string, any> | null>(null);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [gymQ, setGymQ] = useState(query.q || "");
  const abortRef = useRef<AbortController | null>(null);

  const writeParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setRange = (range: RangeKey) => {
    writeParams({
      range,
      start: range === "custom" ? query.start || "" : null,
      end: range === "custom" ? query.end || "" : null,
    });
  };

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const q: AnalyticsQuery = {
        ...query,
        q: activeTab === "gyms" ? gymQ || query.q : query.q,
        tab: activeTab === "content" ? query.tab || "trending_now" : undefined,
      };
      if (activeTab === "overview") {
        const data = await fetchAnalytics<Record<string, any>>("overview", q, ac.signal);
        if (!ac.signal.aborted) setOverview(data);
      } else if (activeTab === "users") {
        const data = await fetchAnalytics<Record<string, any>>("users", q, ac.signal);
        if (!ac.signal.aborted) setUsers(data);
      } else if (activeTab === "gyms") {
        const data = await fetchAnalytics<Record<string, any>>("gyms", q, ac.signal);
        if (!ac.signal.aborted) setGyms(data);
      } else {
        const data = await fetchAnalytics<Record<string, any>>("content", q, ac.signal);
        if (!ac.signal.aborted) setContent(data);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [activeTab, query, gymQ]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const meta =
    (activeTab === "overview" && overview?.meta) ||
    (activeTab === "users" && users?.meta) ||
    (activeTab === "gyms" && gyms?.meta) ||
    (activeTab === "content" && content?.meta) ||
    null;

  const openContent = async (row: Record<string, any>) => {
    setDetailOpen(true);
    setDetail(null);
    try {
      const type = row.content_type === "news" ? "news" : "gym_video";
      const data = await fetchContentDetail(type, row.id, query);
      setDetail(data);
    } catch (err) {
      setDetail({ error: err instanceof Error ? err.message : "Failed to load" });
    }
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Analytics"
        description="User growth, gym growth, and sports content performance"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-text-secondary hover:text-foreground"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </button>
            {activeTab !== "overview" ? (
              <a
                href={exportAnalyticsUrl(
                  activeTab === "users" ? "users" : activeTab === "gyms" ? "gyms" : "content",
                  query,
                )}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-text-secondary hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </a>
            ) : null}
          </div>
        }
      />

      <AnalyticsDateFilter
        range={query.range}
        start={query.start}
        end={query.end}
        timezone={meta?.timezone || ANALYTICS_TZ}
        lastUpdated={meta?.last_updated}
        onRangeChange={setRange}
        onCustomChange={(start, end) => writeParams({ range: "custom", start, end })}
      />

      <div className="flex flex-wrap gap-1 border-b border-border pb-px">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => writeParams({ section: t.key, tab: t.key === "content" ? query.tab || "trending_now" : null })}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activeTab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
        <Link
          href="/admin/news"
          className="ml-auto -mb-px border-b-2 border-transparent px-3 py-2 text-sm text-text-hint hover:text-foreground"
        >
          News management →
        </Link>
      </div>

      {error ? (
        <div className="space-y-2">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-medium text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <OverviewPanel
          loading={loading}
          data={overview}
          onOpenUsers={() => writeParams({ section: "users" })}
          onOpenGyms={() => writeParams({ section: "gyms" })}
          onOpenContent={() => writeParams({ section: "content", tab: "trending_now" })}
          onOpenRow={openContent}
        />
      ) : null}
      {activeTab === "users" ? <UsersPanel loading={loading} data={users} /> : null}
      {activeTab === "gyms" ? (
        <GymsPanel
          loading={loading}
          data={gyms}
          q={gymQ}
          onQChange={setGymQ}
          onSearch={() => writeParams({ q: gymQ || null, section: "gyms" })}
          onSort={(sort, order) => writeParams({ sort, order, section: "gyms" })}
        />
      ) : null}
      {activeTab === "content" ? (
        <ContentPanel
          loading={loading}
          data={content}
          tab={query.tab || "trending_now"}
          onTab={(tab) => writeParams({ section: "content", tab })}
          onOpenRow={openContent}
        />
      ) : null}

      {detailOpen ? (
        <ContentDrawer
          detail={detail}
          onClose={() => {
            setDetailOpen(false);
            setDetail(null);
          }}
        />
      ) : null}
    </div>
  );
}

function OverviewPanel({
  loading,
  data,
  onOpenUsers,
  onOpenGyms,
  onOpenContent,
  onOpenRow,
}: {
  loading: boolean;
  data: Record<string, any> | null;
  onOpenUsers: () => void;
  onOpenGyms: () => void;
  onOpenContent: () => void;
  onOpenRow: (row: Record<string, any>) => void;
}) {
  if (loading && !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (!data) {
    return <EmptyState message="No overview data yet." />;
  }

  const k = data.kpis || {};
  const charts = data.charts || {};
  const dual = mergeSeries(
    charts.user_acquisition || [],
    charts.user_activity?.series || [],
    "new_users",
    "active_users",
  );
  const gymDual = mergeSeries(
    charts.gym_onboarding || [],
    charts.membership_growth || [],
    "new_gyms",
    "memberships",
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard {...k.total_users} onClick={onOpenUsers} />
        <KpiCard {...k.new_users} onClick={onOpenUsers} />
        <KpiCard {...k.active_users} onClick={onOpenUsers} />
        <KpiCard {...k.approved_gyms} onClick={onOpenGyms} />
        <KpiCard {...k.active_memberships} onClick={onOpenGyms} />
        <KpiCard {...k.content_views} onClick={onOpenContent} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="User acquisition & activity"
          subtitle="New registrations vs meaningful active users"
          empty={!dual.length}
        >
          <DualLineChart
            data={dual}
            aKey="new_users"
            bKey="active_users"
            aName="New users"
            bName="Active users"
          />
        </ChartCard>
        <ChartCard
          title="Gym onboarding & memberships"
          subtitle="New gyms vs new memberships"
          empty={!gymDual.length}
        >
          <DualLineChart
            data={gymDual}
            aKey="new_gyms"
            bKey="memberships"
            aName="New gyms"
            bName="Memberships"
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-heading text-sm font-semibold">Top-performing sports content</h3>
            <button type="button" onClick={onOpenContent} className="text-xs text-primary hover:underline">
              View all
            </button>
          </div>
          <ContentMiniTable rows={data.top_content || []} onOpen={onOpenRow} />
        </section>
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-heading text-sm font-semibold">Insights</h3>
          <ul className="space-y-2">
            {(data.insights || []).map((ins: any, i: number) => (
              <li
                key={i}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs leading-relaxed",
                  ins.tone === "positive" && "border-leaf/30 bg-leaf/5 text-foreground",
                  ins.tone === "warning" && "border-destructive/30 bg-destructive/5",
                  ins.tone === "action" && "border-primary/30 bg-secondary",
                  (!ins.tone || ins.tone === "info") && "border-border bg-muted/40 text-text-secondary",
                )}
              >
                {ins.href ? (
                  <Link href={ins.href} className="hover:underline">
                    {ins.text}
                  </Link>
                ) : (
                  ins.text
                )}
              </li>
            ))}
          </ul>
          {data.meta?.gaps ? (
            <p className="mt-4 text-[11px] leading-relaxed text-text-hint">
              Gaps: acquisition, OS split, and content-attributed follows are not tracked yet.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function UsersPanel({ loading, data }: { loading: boolean; data: Record<string, any> | null }) {
  if (loading && !data) return <PanelSkeleton />;
  if (!data) return <EmptyState message="Insufficient user analytics data." />;

  const eng = data.engagement || {};
  const nvr = data.new_vs_returning || {};
  const ret = data.retention || {};
  const first = data.first_meaningful_action || {};

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="New registrations"
          value={data.registrations?.total}
          previous={data.registrations?.previous_total}
          changePct={
            data.registrations?.previous_total
              ? Math.round(
                  ((data.registrations.total - data.registrations.previous_total) /
                    Math.max(data.registrations.previous_total, 1)) *
                    1000,
                ) / 10
              : null
          }
          tooltip="Accounts created in the selected period"
        />
        <KpiCard label="DAU" value={eng.dau} status={eng.status} tooltip={eng.tooltips?.dau} kind="stock" />
        <KpiCard label="WAU" value={eng.wau} status={eng.status} tooltip={eng.tooltips?.wau} kind="stock" />
        <KpiCard label="MAU" value={eng.mau} status={eng.status} tooltip={eng.tooltips?.mau} kind="stock" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="New registrations over time" empty={!data.registrations?.series?.length}>
          <SeriesAreaChart data={data.registrations?.series || []} name="Registrations" />
        </ChartCard>
        <ChartCard title="Cumulative registered users" empty={!data.cumulative_users?.length}>
          <SeriesAreaChart data={data.cumulative_users || []} name="Users" color="#0d2f6e" />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-1 flex items-center gap-1 font-heading text-sm font-semibold">
            New vs returning active
            <span title="Among meaningful active users in the period">
              <HelpCircle className="h-3.5 w-3.5 text-text-hint" />
            </span>
          </h3>
          {nvr.status === "not_tracked" ? (
            <p className="mt-4 text-sm text-text-hint">Not tracked yet</p>
          ) : (
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">New active</span>
                <span className="font-medium tabular-nums">{formatCompact(nvr.new_active)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Returning active</span>
                <span className="font-medium tabular-nums">{formatCompact(nvr.returning_active)}</span>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-1 flex items-center gap-1 font-heading text-sm font-semibold">
            First meaningful action
            <span title={first.tooltip || ""}>
              <HelpCircle className="h-3.5 w-3.5 text-text-hint" />
            </span>
          </h3>
          {first.status === "not_tracked" ? (
            <p className="mt-4 text-sm text-text-hint">{first.message || "Not tracked yet"}</p>
          ) : (
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Conversion</span>
                <span className="font-medium tabular-nums">
                  {first.rate_pct != null ? `${first.rate_pct}%` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Converted</span>
                <span className="tabular-nums">
                  {formatCompact(first.converted)} / {formatCompact(first.registered)}
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-heading text-sm font-semibold">Attribution & platforms</h3>
          <p className="text-xs text-text-hint">
            {data.acquisition_sources?.message || "Acquisition sources: Not tracked yet"}
          </p>
          <p className="mt-2 text-xs text-text-hint">
            {data.platforms?.message || "Android vs iOS: Not tracked yet"}
          </p>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-1 flex items-center gap-1 font-heading text-sm font-semibold">
          Cohort retention (D1 / D7 / D30)
          <span title={ret.tooltip || ""}>
            <HelpCircle className="h-3.5 w-3.5 text-text-hint" />
          </span>
        </h3>
        <p className="mb-3 text-xs text-text-secondary">
          Only cohorts old enough to reach each day are shown with rates.
        </p>
        {ret.status === "not_tracked" ? (
          <p className="text-sm text-text-hint">{ret.message}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="border-b border-border text-text-hint">
                <tr>
                  <th className="py-2 pr-3 font-medium">Cohort</th>
                  <th className="py-2 pr-3 font-medium">Size</th>
                  <th className="py-2 pr-3 font-medium">D1</th>
                  <th className="py-2 pr-3 font-medium">D7</th>
                  <th className="py-2 font-medium">D30</th>
                </tr>
              </thead>
              <tbody>
                {(ret.cohorts || []).slice(-14).map((c: any) => (
                  <tr key={c.cohort_day} className="border-b border-border/60">
                    <td className="py-2 pr-3 tabular-nums">{c.cohort_day}</td>
                    <td className="py-2 pr-3 tabular-nums">{c.cohort_size}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {c.d1_rate != null ? `${c.d1_rate}%` : "—"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {c.d7_rate != null ? `${c.d7_rate}%` : "—"}
                    </td>
                    <td className="py-2 tabular-nums">
                      {c.d30_rate != null ? `${c.d30_rate}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ChartCard title="Geographic breakdown (new registrations)" empty={!data.geography?.length}>
        <SimpleBarChart
          data={(data.geography || []).map((g: any) => ({
            label: g.country,
            value: Number(g.users),
          }))}
        />
      </ChartCard>
    </div>
  );
}

function GymsPanel({
  loading,
  data,
  q,
  onQChange,
  onSearch,
  onSort,
}: {
  loading: boolean;
  data: Record<string, any> | null;
  q: string;
  onQChange: (v: string) => void;
  onSearch: () => void;
  onSort: (sort: string, order: string) => void;
}) {
  if (loading && !data) return <PanelSkeleton />;
  if (!data) return <EmptyState message="Insufficient gym analytics data." />;

  const k = data.kpis || {};
  const funnel = data.funnel || {};
  const table = data.table || {};
  const steps = [
    ["Registered", funnel.registered],
    ["Submitted", funnel.submitted_for_approval],
    ["Approved", funnel.approved],
    ["Published", funnel.published],
    ["First paid", funnel.first_paid_membership],
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Newly registered gyms"
          value={k.new_gyms?.value}
          previous={k.new_gyms?.previous}
          changePct={k.new_gyms?.change_pct}
        />
        <KpiCard
          label="Active gyms"
          value={k.active_gyms?.value}
          kind="stock"
          tooltip={k.active_gyms?.definition}
        />
        <KpiCard label="New memberships" value={k.memberships?.new} />
        <KpiCard
          label={`Verified revenue (${k.revenue?.currency || "ETB"})`}
          value={k.revenue?.net}
          tooltip="Paid/success payments minus refunds in the period"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-heading text-sm font-semibold">Approval status</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(k.by_verification || {}).map(([status, cnt]) => (
              <div key={status} className="flex justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="capitalize text-text-secondary">{status}</span>
                <span className="font-medium tabular-nums">{formatCompact(Number(cnt))}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-text-secondary">
            <div>Expired (period): {formatCompact(k.memberships?.expired)}</div>
            <div>Cancelled (period): {formatCompact(k.memberships?.cancelled)}</div>
            <div>Renewals (proxy): {formatCompact(k.memberships?.renewed_proxy)}</div>
            <div>Refunds: {formatCompact(k.revenue?.refunds)} {k.revenue?.currency}</div>
          </div>
          {k.conversion?.renewal_note ? (
            <p className="mt-3 text-[11px] text-text-hint">{k.conversion.renewal_note}</p>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-1 font-heading text-sm font-semibold">Onboarding funnel</h3>
          <p className="mb-3 text-[11px] text-text-hint">{funnel.note}</p>
          <ol className="space-y-2">
            {steps.map(([label, value], i) => (
              <li key={String(label)} className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm">{label}</span>
                <span className="font-medium tabular-nums text-sm">{formatCompact(Number(value))}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-heading text-sm font-semibold">Gym performance</h3>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onSearch();
            }}
          >
            <input
              value={q}
              onChange={(e) => onQChange(e.target.value)}
              placeholder="Search gyms…"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm sm:w-56"
            />
            <button
              type="submit"
              className="h-9 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground"
            >
              Search
            </button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-border text-text-hint">
              <tr>
                {[
                  ["name", "Gym"],
                  ["location", "Location"],
                  ["new_memberships", "New mem."],
                  ["active_memberships", "Active"],
                  ["renewals", "Renewals"],
                  ["revenue", "Revenue"],
                ].map(([key, label]) => (
                  <th key={key} className="py-2 pr-3 font-medium">
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() =>
                        onSort(
                          key,
                          table.sort === key && table.order === "desc" ? "asc" : "desc",
                        )
                      }
                    >
                      {label}
                    </button>
                  </th>
                ))}
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(table.rows || []).map((row: any) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="py-2.5 pr-3">
                    <Link href={`/admin/gyms/${row.id}`} className="font-medium text-primary hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-text-secondary">
                    {[row.city, row.country].filter(Boolean).join(", ")}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">{row.new_memberships}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{row.active_memberships}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{row.renewals}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {formatCompact(row.verified_revenue)} {row.currency}
                  </td>
                  <td className="py-2.5 capitalize text-text-secondary">{row.verification_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!table.rows?.length ? (
            <p className="py-8 text-center text-sm text-text-hint">No gyms match this filter.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ContentPanel({
  loading,
  data,
  tab,
  onTab,
  onOpenRow,
}: {
  loading: boolean;
  data: Record<string, any> | null;
  tab: string;
  onTab: (tab: string) => void;
  onOpenRow: (row: Record<string, any>) => void;
}) {
  if (loading && !data) return <PanelSkeleton />;
  if (!data) return <EmptyState message="Insufficient content analytics data." />;

  const by = data.by_type || {};
  const news = by.news || {};
  const videos = by.gym_video || {};

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Published (period)" value={data.published?.total} kind="period" />
        <KpiCard label="News views (period)" value={news.views} tooltip="Separated from gym videos" />
        <KpiCard label="Gym video views" value={videos.views} />
        <KpiCard
          label="Avg engagement (news)"
          value={news.avg_engagement_rate}
          tooltip="(likes+comments+saves+shares) / views × 100"
        />
      </div>

      <p className="text-xs text-text-hint">{by.note}</p>
      {data.creator_follows?.status === "not_tracked" ? (
        <p className="text-xs text-text-hint">{data.creator_follows.message}</p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {CONTENT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTab(t.key)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium",
              tab === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-text-secondary hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
        <span
          title={(data.meta?.definitions?.trending_score_formula as string) || "trending_v1"}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-hint"
        >
          Score {data.meta?.definitions?.trending_score || "trending_v1"}
          <HelpCircle className="h-3 w-3" />
        </span>
      </div>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-text-hint">
              <tr>
                <th className="px-4 py-2.5 font-medium">Content</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Views</th>
                <th className="px-3 py-2.5 font-medium">Shares</th>
                <th className="px-3 py-2.5 font-medium">Eng %</th>
                <th className="px-3 py-2.5 font-medium">Watch</th>
                <th className="px-3 py-2.5 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {(data.table?.rows || []).map((row: any) => (
                <tr
                  key={`${row.content_type}-${row.id}`}
                  className="cursor-pointer border-b border-border/60 hover:bg-muted/30"
                  onClick={() => onOpenRow(row)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Thumb url={row.thumbnail_url} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{row.title}</p>
                        <p className="truncate text-text-hint">{row.creator}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 capitalize text-text-secondary">
                    {row.content_type?.replace("_", " ")}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{formatCompact(row.views)}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {row.shares_status === "not_tracked" ? "—" : formatCompact(row.shares)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.engagement_rate ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums text-text-secondary">
                    {row.completion_rate != null
                      ? `${row.completion_rate}%`
                      : row.avg_watch_ms != null
                        ? `${Math.round(row.avg_watch_ms / 1000)}s`
                        : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-medium">
                    {row.trending_score != null ? row.trending_score : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.table?.rows?.length ? (
            <p className="py-10 text-center text-sm text-text-hint">No content in this period.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ContentMiniTable({
  rows,
  onOpen,
}: {
  rows: any[];
  onOpen: (row: any) => void;
}) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-text-hint">No content performance data yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border text-text-hint">
          <tr>
            <th className="py-2 pr-2 font-medium">Title</th>
            <th className="py-2 pr-2 font-medium">Views</th>
            <th className="py-2 font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.content_type}-${row.id}`}
              className="cursor-pointer border-b border-border/50 hover:bg-muted/30"
              onClick={() => onOpen(row)}
            >
              <td className="max-w-[220px] truncate py-2 pr-2 font-medium">{row.title}</td>
              <td className="py-2 pr-2 tabular-nums">{formatCompact(row.views)}</td>
              <td className="py-2 tabular-nums">{row.trending_score ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContentDrawer({
  detail,
  onClose,
}: {
  detail: Record<string, any> | null;
  onClose: () => void;
}) {
  const item = detail?.item;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-heading text-sm font-semibold">Content detail</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-text-secondary" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!detail ? (
            <div className="animate-pulse space-y-3">
              <div className="h-40 rounded-lg bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
            </div>
          ) : detail.error ? (
            <p className="text-sm text-destructive">{detail.error}</p>
          ) : !item ? (
            <p className="text-sm text-text-hint">Insufficient data for this item.</p>
          ) : (
            <div className="space-y-4">
              <Thumb url={item.thumbnail_url} large />
              <div>
                <p className="font-heading text-base font-semibold">{item.title}</p>
                <p className="text-xs text-text-secondary">{item.creator}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Views" value={formatCompact(item.views)} />
                <Stat label="Engagement" value={`${item.engagement_rate ?? "—"}%`} />
                <Stat label="Shares" value={formatCompact(item.shares)} />
                <Stat
                  label="Completion"
                  value={item.completion_rate != null ? `${item.completion_rate}%` : "—"}
                />
              </div>
              <ChartCard title="Performance over time" empty={!detail.performance_over_time?.length}>
                <SeriesAreaChart data={detail.performance_over_time || []} name="Views" />
              </ChartCard>
              <div className="rounded-lg border border-border p-3 text-xs text-text-secondary">
                <p className="mb-1 font-medium text-foreground">Traffic sources</p>
                {detail.traffic_sources?.status === "not_tracked"
                  ? detail.traffic_sources.message
                  : "—"}
              </div>
              {item.manage_href ? (
                <Link
                  href={item.manage_href}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Open management page <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-text-hint">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function Thumb({ url, large }: { url?: string; large?: boolean }) {
  if (!url) {
    return (
      <div
        className={cn(
          "shrink-0 rounded-md bg-muted",
          large ? "h-40 w-full" : "h-10 w-10",
        )}
      />
    );
  }
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-md bg-muted", large ? "h-40 w-full" : "h-10 w-10")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-text-hint">
      {message}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}
