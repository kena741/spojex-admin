"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { useAdminPermissions } from "@/lib/use-admin-permissions";

type Metric = { value: number | null; available: boolean; note?: string | null };

type OverviewPayload = {
  modules?: Record<string, Record<string, Metric | string>>;
  attention?: { key: string; label: string; count: number; href: string }[];
  generated_at?: string;
  error?: string;
};

function MetricValue({ metric, loading }: { metric?: Metric; loading: boolean }) {
  if (loading) return <div className="mt-1 h-7 w-12 animate-pulse rounded bg-muted" />;
  if (!metric || !metric.available || metric.value == null) {
    return (
      <p className="mt-1 text-sm text-text-hint" title={metric?.note || undefined}>
        Unavailable
      </p>
    );
  }
  return (
    <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
      {new Intl.NumberFormat("en-US").format(metric.value)}
    </p>
  );
}

export default function NativeAppsOverviewPage() {
  const { can, loading: permsLoading } = useAdminPermissions();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (permsLoading) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/native-apps/overview", { cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json()) as OverviewPayload;
        if (!res.ok) throw new Error(payload.error || "Failed to load overview");
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [permsLoading]);

  const modules = data?.modules ?? {};
  const attention = data?.attention ?? [];

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Native Apps"
        description="Operations hub for venues, events, donations, and streams"
      />

      {error ? <AdminErrorAlert message={error} /> : null}
      {loading || permsLoading ? <AdminLoadingRow label="Loading Native Apps overview…" /> : null}

      {!loading && !permsLoading && attention.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="mb-3 font-heading text-sm font-semibold text-amber-950">Needs attention</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm hover:border-amber-300"
                >
                  <span>{item.label}</span>
                  <span className="font-semibold tabular-nums text-amber-900">{item.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!loading && !permsLoading && attention.length === 0 && !error ? (
        <p className="text-sm text-text-secondary">No pending approvals or queues right now.</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {can("stadiums:read") ? (
          <ModuleCard
            title="Stadiums"
            href="/admin/stadiums"
            loading={loading}
            items={[
              { label: "Pending approvals", metric: modules.stadiums?.pending_approvals as Metric },
              { label: "Active venues", metric: modules.stadiums?.active as Metric },
              { label: "Total", metric: modules.stadiums?.total as Metric },
            ]}
          />
        ) : null}
        {can("gyms:read") ? (
          <ModuleCard
            title="Gyms"
            href="/admin/gyms"
            loading={loading}
            items={[
              {
                label: "Verification requests",
                metric: modules.gyms?.pending_verification as Metric,
              },
              { label: "Feature requests", metric: modules.gyms?.pending_feature as Metric },
              { label: "Active verified", metric: modules.gyms?.active_verified as Metric },
            ]}
          />
        ) : null}
        {can("events:read") ? (
          <ModuleCard
            title="Events"
            href="/admin/events"
            loading={loading}
            items={[
              { label: "Upcoming (14 days)", metric: modules.events?.upcoming_14d as Metric },
              { label: "Sales open", metric: modules.events?.sales_open as Metric },
              { label: "Total", metric: modules.events?.total as Metric },
            ]}
          />
        ) : null}
        {can("donations:read") ? (
          <ModuleCard
            title="Donations"
            href="/admin/donations"
            loading={loading}
            items={[
              { label: "Active campaigns", metric: modules.donations?.active_campaigns as Metric },
              { label: "Total campaigns", metric: modules.donations?.total as Metric },
            ]}
          />
        ) : null}
        {can("streams:read") || can("events:read") ? (
          <ModuleCard
            title="Streams"
            href="/admin/streams"
            loading={loading}
            items={[
              { label: "Radio live/active", metric: modules.streams?.radio_live as Metric },
              { label: "Radio stations", metric: modules.streams?.radio_total as Metric },
              { label: "Video live", metric: modules.streams?.video_live as Metric },
              { label: "Video events", metric: modules.streams?.video_total as Metric },
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}

function ModuleCard({
  title,
  href,
  items,
  loading,
}: {
  title: string;
  href: string;
  items: { label: string; metric?: Metric }[];
  loading: boolean;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
        <span className="text-xs font-medium text-primary">Open</span>
      </div>
      <dl className="space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-text-hint">
              {item.label}
            </dt>
            <dd>
              <MetricValue metric={item.metric} loading={loading} />
            </dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}
