"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  HelpCircle,
  LayoutGrid,
  RefreshCw,
  Store,
  Users,
} from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { cn, formatDateTime } from "@/lib/utils";

type Metric = {
  value: number | string | null;
  available?: boolean;
  currency?: string;
  note?: string;
  href?: string | null;
  kind?: string;
  previous?: number | string | null;
  delta_pct?: number | null;
  delta_label?: string | null;
  timestamp_field?: string | null;
};

type QueueItem = {
  id?: string;
  title?: string;
  service_title?: string;
  requester_name?: string;
  provider_name?: string;
  payer_name?: string;
  status?: string;
  created_at?: string | null;
  appointment_label?: string;
  payment_status?: string | null;
  payment_amount?: string | number | null;
  payment_currency?: string | null;
  amount?: string | number | null;
  currency?: string | null;
  href?: string;
  action_label?: string;
};

type Queue = { total?: number; items?: QueueItem[] };

type Overview = {
  metrics?: Record<string, Metric>;
  definitions?: Record<string, string>;
  period?: {
    days?: number;
    label?: string;
    start_date?: string;
    end_date?: string;
    timezone?: string;
  };
  generated_at?: string;
  sections?: Record<string, { available?: boolean; error?: string; note?: string }>;
  queues?: Record<string, Queue>;
  trends?: {
    available?: boolean;
    bookings_created?: Array<{ day: string; requests: number }>;
    bookings_completed?: Array<{ day: string; completions: number }>;
    finance?: Array<{ day: string; verified?: string | null; refunds?: string | null; currency?: string }>;
    booking_status_distribution?: {
      cohort?: string;
      items?: Array<{ status: string; count: number }>;
    };
  };
  completion_rate?: {
    value?: number;
    numerator?: number;
    denominator?: number;
    definition?: string;
  } | null;
  panels?: {
    opportunities?: {
      available?: boolean;
      open?: Metric;
      open_applications?: Metric;
      waitlist?: Metric;
      next_deadline?: string | null;
      href?: string;
    };
    mini_apps?: {
      available?: boolean;
      published?: Metric;
      hidden?: Metric;
      incomplete?: Metric;
      href?: string;
    };
  };
  links?: Record<string, string>;
  source?: string;
  error?: string;
};

function displayMetric(m?: Metric) {
  if (!m || m.available === false || m.value == null) return "Unavailable";
  if (m.currency) {
    return `${m.currency} ${Number(m.value).toLocaleString("en-ET", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return Number(m.value).toLocaleString("en-US");
}

function Delta({ m }: { m?: Metric }) {
  if (!m || m.available === false || m.previous == null) return null;
  if (m.delta_label === "New activity") {
    return <span className="text-[11px] font-medium text-emerald-700">New activity</span>;
  }
  if (m.delta_pct == null) {
    return <span className="text-[11px] text-text-hint">{m.delta_label || "No change"}</span>;
  }
  const up = m.delta_pct >= 0;
  return (
    <span className={cn("text-[11px] font-medium", up ? "text-emerald-700" : "text-red-700")}>
      {up ? "+" : ""}
      {m.delta_pct}% vs prior
    </span>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <HelpCircle className="h-3.5 w-3.5 text-text-hint" aria-label="Definition" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-card p-2 text-[11px] font-normal normal-case tracking-normal text-text-secondary shadow-md group-hover:block">
        {text}
      </span>
    </span>
  );
}

export default function MarketplaceOverviewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rangeDays = Number(searchParams.get("range_days") || 30) || 30;
  const customStart = searchParams.get("start") || "";
  const customEnd = searchParams.get("end") || "";

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [defsOpen, setDefsOpen] = useState(false);
  const requestId = useRef(0);

  const writeRange = useCallback(
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

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setOk(false);
    try {
      const params = new URLSearchParams();
      if (customStart && customEnd) {
        params.set("start", customStart);
        params.set("end", customEnd);
      } else {
        params.set("range_days", String(rangeDays));
      }
      const res = await fetch(`/api/admin/marketplace/overview?${params}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as Overview;
      if (id !== requestId.current) return; // stale
      if (!res.ok) throw new Error(payload.error || "Failed to load overview");
      setData(payload);
      setOk(true);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [rangeDays, customStart, customEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const m = data?.metrics ?? {};
  const queues = data?.queues ?? {};
  const defs = data?.definitions ?? {};
  const sections = data?.sections ?? {};

  const attentionEmpty =
    (queues.pending_approvals?.total ?? 0) +
      (queues.pending_bookings?.total ?? 0) +
      (queues.unscheduled?.total ?? 0) +
      (queues.payment_exceptions?.total ?? 0) ===
    0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Marketplace"
        description="Live marketplace activity across services, bookings, and collections"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDefsOpen((v) => !v)}
              className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-text-secondary"
            >
              Metric definitions
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() =>
              writeRange({
                range_days: String(d),
                start: null,
                end: null,
              })
            }
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium",
              !customStart && rangeDays === d
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-text-secondary",
            )}
          >
            {d} days
          </button>
        ))}
        <label className="grid gap-0.5 text-[11px] text-text-secondary">
          From
          <input
            type="date"
            value={customStart}
            onChange={(e) =>
              writeRange({
                start: e.target.value || null,
                end: customEnd || e.target.value || null,
                range_days: null,
              })
            }
            className="rounded-md border border-border bg-card px-2 py-1 text-xs"
          />
        </label>
        <label className="grid gap-0.5 text-[11px] text-text-secondary">
          To
          <input
            type="date"
            value={customEnd}
            onChange={(e) =>
              writeRange({
                end: e.target.value || null,
                start: customStart || e.target.value || null,
                range_days: null,
              })
            }
            className="rounded-md border border-border bg-card px-2 py-1 text-xs"
          />
        </label>
        {data?.generated_at ? (
          <span className="ml-auto text-[11px] text-text-hint">
            Updated {formatDateTime(data.generated_at)}
            {data.period?.timezone ? ` · ${data.period.timezone}` : ""}
            {data.source ? ` · ${data.source}` : ""}
          </span>
        ) : null}
      </div>

      {data?.period?.label ? (
        <p className="text-xs text-text-hint">
          Period activity: {data.period.label}. Snapshot metrics (queues, published counts) are
          current — not filtered by this range.
        </p>
      ) : null}

      {defsOpen && Object.keys(defs).length > 0 ? (
        <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs text-text-secondary">
          <p className="mb-2 font-medium text-foreground">Definitions</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(defs).map(([key, value]) => (
              <li key={key}>
                <span className="font-medium text-foreground">{key.replace(/_/g, " ")}</span>
                — {value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <div className="space-y-2">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="space-y-3">
          <AdminLoadingRow label="Loading marketplace overview…" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-muted/40" />
            ))}
          </div>
        </div>
      ) : null}

      {!loading && ok ? (
        <>
          {/* Primary summary */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-hint">
              Summary
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <PrimaryCard
                icon={<CircleDollarSign className="h-4 w-4" />}
                label="Verified collections"
                value={displayMetric(m.verified_collections_etb)}
                href={m.verified_collections_etb?.href}
                hint={defs.verified_collection || m.verified_collections_etb?.note}
                delta={<Delta m={m.verified_collections_etb} />}
                available={m.verified_collections_etb?.available !== false}
                sectionOk={sections.finance?.available !== false}
              />
              <PrimaryCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Completed bookings"
                value={displayMetric(m.completed_bookings_period)}
                href={m.completed_bookings_period?.href}
                hint={defs.completed_booking}
                delta={<Delta m={m.completed_bookings_period} />}
                available={m.completed_bookings_period?.available !== false}
                sectionOk={sections.bookings?.available !== false}
              />
              <PrimaryCard
                icon={<Store className="h-4 w-4" />}
                label="Published services"
                value={displayMetric(m.published_services)}
                href={m.published_services?.href}
                hint="Snapshot — current published listings"
                badge="Snapshot"
                available={m.published_services?.available !== false}
                sectionOk={sections.services?.available !== false}
              />
              <PrimaryCard
                icon={<Users className="h-4 w-4" />}
                label="Active providers"
                value={displayMetric(m.active_providers)}
                hint={defs.active_provider}
                badge="Snapshot"
                available={m.active_providers?.available !== false}
                sectionOk={sections.services?.available !== false}
              />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <CompactMoney
                label="Refunds"
                metric={m.refunds_etb}
                sectionOk={sections.finance?.available !== false}
              />
              <CompactMoney
                label="Platform commission"
                metric={m.platform_commission_etb}
                sectionOk={sections.finance?.available !== false}
              />
              <CompactMoney
                label="Cancelled / declined"
                metric={m.closed_bookings_period}
                sectionOk={sections.bookings?.available !== false}
              />
            </div>
          </section>

          {/* Needs attention */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-hint">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
              Needs attention
            </h2>
            <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <AttentionChip
                label="Pending service approvals"
                metric={m.pending_approvals}
                tone="warning"
              />
              <AttentionChip
                label="Pending booking responses"
                metric={m.pending_bookings}
                tone="warning"
                hint={defs.pending_booking}
              />
              <AttentionChip
                label="Payment verification issues"
                metric={m.payment_exceptions}
                tone="danger"
              />
              <AttentionChip
                label="Accepted, not scheduled"
                metric={m.accepted_unscheduled}
                tone="warning"
                hint={defs.accepted_unscheduled}
              />
              <AttentionChip
                label="Overdue appointments"
                metric={m.overdue_appointments}
                tone="danger"
              />
            </div>

            {attentionEmpty ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-6 text-center text-sm text-emerald-900">
                Nothing needs attention right now.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <QueueCard
                  title="Services awaiting approval"
                  queue={queues.pending_approvals}
                  empty="No pending listings"
                />
                <QueueCard
                  title="Bookings awaiting provider response"
                  queue={queues.pending_bookings}
                  empty="No pending bookings"
                />
                <QueueCard
                  title="Accepted bookings missing appointment times"
                  queue={queues.unscheduled}
                  empty="All accepted bookings have a schedule"
                />
                <QueueCard
                  title="Payment exceptions"
                  queue={queues.payment_exceptions}
                  empty="No failed payments"
                />
              </div>
            )}
          </section>

          {/* Upcoming */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-text-secondary" />
                <h2 className="text-sm font-semibold">Upcoming bookings (14 days)</h2>
                <Hint text={defs.upcoming_booking || "Accepted with confirmed schedule ahead."} />
              </div>
              <div className="flex items-center gap-3">
                <span className="font-heading text-lg font-semibold tabular-nums">
                  {displayMetric(m.upcoming_bookings)}
                </span>
                {m.upcoming_bookings?.href ? (
                  <Link
                    href={m.upcoming_bookings.href}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    View exact queue
                  </Link>
                ) : null}
              </div>
            </div>
            <p className="mt-1 text-[11px] text-text-hint">
              Future window — not filtered by the historical period above. Unscheduled accepted
              bookings are counted separately.
            </p>
          </section>

          {/* Trends */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-hint">
              Trends
            </h2>
            {data?.trends?.available === false || sections.trends?.available === false ? (
              <p className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-text-secondary">
                {sections.trends?.error
                  ? `Trends unavailable: ${sections.trends.error}`
                  : "Trend series unavailable for this response. Counts above remain authoritative."}
                {sections.trends?.available === false ? (
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="ml-2 text-primary hover:underline"
                  >
                    Retry
                  </button>
                ) : null}
              </p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <TrendBars
                  title="Booking requests (created)"
                  points={(data?.trends?.bookings_created ?? []).map((p) => ({
                    day: p.day,
                    value: p.requests,
                  }))}
                  unit="count"
                />
                <TrendBars
                  title="Completions (by completed_at)"
                  points={(data?.trends?.bookings_completed ?? []).map((p) => ({
                    day: p.day,
                    value: p.completions,
                  }))}
                  unit="count"
                />
                <TrendBars
                  title={`Verified collections (${m.verified_collections_etb?.currency || "ETB"})`}
                  points={(data?.trends?.finance ?? []).map((p) => ({
                    day: p.day,
                    value: Number(p.verified || 0),
                  }))}
                  unit="money"
                />
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <p className="text-sm font-semibold">Booking status distribution</p>
                  <p className="mt-1 text-[11px] text-text-hint">
                    {data?.trends?.booking_status_distribution?.cohort ||
                      "Bookings created in the selected period"}
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {(data?.trends?.booking_status_distribution?.items ?? []).map((item) => (
                      <li key={item.status} className="flex items-center justify-between text-xs">
                        <StatusBadge tone={requestTone(item.status)}>
                          {item.status.replace(/_/g, " ")}
                        </StatusBadge>
                        <span className="tabular-nums font-medium">{item.count}</span>
                      </li>
                    ))}
                    {(data?.trends?.booking_status_distribution?.items ?? []).length === 0 ? (
                      <li className="text-xs text-text-hint">Low volume — no bookings created in range.</li>
                    ) : null}
                  </ul>
                  {data?.completion_rate ? (
                    <p className="mt-3 border-t border-border pt-3 text-xs text-text-secondary">
                      Completion rate (created cohort):{" "}
                      <strong>{data.completion_rate.value}%</strong> (
                      {data.completion_rate.numerator}/{data.completion_rate.denominator}).{" "}
                      {data.completion_rate.definition}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          {/* Secondary modules */}
          <section className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <ClipboardList className="h-4 w-4" />
                  Opportunities
                </h2>
                <Link
                  href={data?.panels?.opportunities?.href || "/admin/opportunities?status=open"}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Open workspace
                </Link>
              </div>
              {data?.panels?.opportunities?.available === false ||
              sections.opportunities?.available === false ? (
                <p className="text-sm text-text-hint">
                  Unavailable
                  <button type="button" onClick={() => void load()} className="ml-2 text-primary">
                    Retry
                  </button>
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Open" value={displayMetric(m.open_opportunities)} href={m.open_opportunities?.href} />
                  <MiniStat
                    label="Open applications"
                    value={displayMetric(m.open_applications)}
                    href={m.open_applications?.href}
                    hint={defs.open_application}
                  />
                  <MiniStat label="Waitlist" value={displayMetric(m.waitlist)} />
                </div>
              )}
              {data?.panels?.opportunities?.next_deadline ? (
                <p className="mt-3 text-[11px] text-text-hint">
                  Next deadline: {formatDateTime(data.panels.opportunities.next_deadline)}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <LayoutGrid className="h-4 w-4" />
                  Mini apps
                </h2>
                <Link
                  href={data?.panels?.mini_apps?.href || "/admin/miniapps"}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Open catalog
                </Link>
              </div>
              {data?.panels?.mini_apps?.available === false ||
              sections.mini_apps?.available === false ? (
                <p className="text-sm text-text-hint">
                  Unavailable
                  <button type="button" onClick={() => void load()} className="ml-2 text-primary">
                    Retry
                  </button>
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Published" value={displayMetric(m.mini_apps_published)} href={m.mini_apps_published?.href} />
                  <MiniStat label="Hidden" value={displayMetric(m.mini_apps_hidden)} href={m.mini_apps_hidden?.href} />
                  <MiniStat label="Incomplete" value={displayMetric(m.mini_apps_incomplete)} />
                </div>
              )}
            </div>
          </section>

          <div className="flex flex-wrap gap-3 border-t border-border pt-4 text-sm">
            <FooterLink href={data?.links?.services || "/admin/services"} label="Services" />
            <FooterLink href={data?.links?.bookings || "/admin/requests"} label="Bookings" />
            <FooterLink href={data?.links?.finance_service || "/admin/finance/transactions?module=service"} label="Finance (services)" />
            <FooterLink href={data?.links?.opportunities || "/admin/opportunities"} label="Opportunities" />
            <FooterLink href={data?.links?.miniapps || "/admin/miniapps"} label="Mini apps" />
            <FooterLink href={data?.links?.settings || "/admin/marketplace/settings"} label="Settings" />
            <FooterLink href={data?.links?.categories || "/admin/services/settings"} label="Categories" />
          </div>
        </>
      ) : null}
    </div>
  );
}

function PrimaryCard({
  icon,
  label,
  value,
  href,
  hint,
  delta,
  badge,
  available,
  sectionOk,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string | null;
  hint?: string;
  delta?: React.ReactNode;
  badge?: string;
  available: boolean;
  sectionOk: boolean;
}) {
  const body = (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-text-secondary">
          {icon}
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-hint">{label}</p>
          {hint ? <Hint text={hint} /> : null}
        </div>
        {badge ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-text-hint">{badge}</span>
        ) : null}
      </div>
      <p className="mt-2 font-heading text-2xl font-semibold tabular-nums">
        {!sectionOk || !available ? "Unavailable" : value}
      </p>
      <div className="mt-1">{delta}</div>
    </div>
  );
  if (href && sectionOk && available) return <Link href={href}>{body}</Link>;
  return body;
}

function CompactMoney({
  label,
  metric,
  sectionOk,
}: {
  label: string;
  metric?: Metric;
  sectionOk: boolean;
}) {
  const inner = (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[11px] text-text-hint">{label}</p>
      <p className="text-sm font-semibold tabular-nums">
        {!sectionOk || metric?.available === false ? "Unavailable" : displayMetric(metric)}
      </p>
      <Delta m={metric} />
    </div>
  );
  if (metric?.href && sectionOk && metric.available !== false) {
    return <Link href={metric.href}>{inner}</Link>;
  }
  return inner;
}

function AttentionChip({
  label,
  metric,
  tone,
  hint,
}: {
  label: string;
  metric?: Metric;
  tone: "warning" | "danger";
  hint?: string;
}) {
  const n = metric?.available === false ? null : Number(metric?.value ?? 0);
  const active = n != null && n > 0;
  const inner = (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        active
          ? tone === "danger"
            ? "border-red-200 bg-red-50"
            : "border-amber-200 bg-amber-50"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-1 text-[11px] text-text-secondary">
        {label}
        {hint ? <Hint text={hint} /> : null}
      </div>
      <p className="text-lg font-semibold tabular-nums">
        {metric?.available === false ? "—" : n?.toLocaleString("en-US") ?? "—"}
      </p>
    </div>
  );
  if (metric?.href) return <Link href={metric.href}>{inner}</Link>;
  return inner;
}

function QueueCard({
  title,
  queue,
  empty,
}: {
  title: string;
  queue?: Queue;
  empty: string;
}) {
  const items = queue?.items ?? [];
  const total = queue?.total ?? 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-text-hint">{total}</span>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-hint">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item, i) => (
            <li key={item.id || i} className="flex items-start justify-between gap-2 py-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {item.service_title || item.title || item.id?.slice(0, 8) || "Item"}
                </p>
                <p className="truncate text-text-hint">
                  {[item.requester_name || item.payer_name, item.provider_name]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                  {item.status ? ` · ${item.status}` : ""}
                  {item.appointment_label ? ` · ${item.appointment_label}` : ""}
                  {item.created_at ? ` · ${formatDateTime(item.created_at)}` : ""}
                </p>
                {item.payment_amount != null || item.amount != null ? (
                  <p className="text-text-hint">
                    {item.payment_currency || item.currency}{" "}
                    {Number(item.payment_amount ?? item.amount).toLocaleString("en-ET")}
                    {item.payment_status ? ` · ${item.payment_status}` : ""}
                  </p>
                ) : null}
              </div>
              {item.href ? (
                <Link
                  href={item.href}
                  className="shrink-0 rounded border border-border px-2 py-1 font-medium hover:bg-muted"
                >
                  {item.action_label || "Open"}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string;
  href?: string | null;
  hint?: string;
}) {
  const inner = (
    <div className="rounded-lg bg-muted/40 px-2 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] text-text-hint">
        {label}
        {hint ? <Hint text={hint} /> : null}
      </div>
      <p className="text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function TrendBars({
  title,
  points,
  unit,
}: {
  title: string;
  points: Array<{ day: string; value: number }>;
  unit: "count" | "money";
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm font-semibold">{title}</p>
      {points.length === 0 ? (
        <p className="mt-4 text-xs text-text-hint">Low volume — no data points in this range.</p>
      ) : (
        <div className="mt-3 flex h-28 items-end gap-1">
          {points.map((p) => (
            <div key={p.day} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div
                className="w-full rounded-t bg-primary/70"
                style={{ height: `${Math.max(4, (p.value / max) * 100)}%` }}
                title={`${p.day}: ${unit === "money" ? p.value.toLocaleString("en-ET") : p.value}`}
              />
            </div>
          ))}
        </div>
      )}
      {points.length > 0 ? (
        <p className="mt-2 text-[10px] text-text-hint">
          {points[0]?.day} → {points[points.length - 1]?.day}
        </p>
      ) : null}
    </div>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {label}
    </Link>
  );
}
