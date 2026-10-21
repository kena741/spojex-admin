"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { cn } from "@/lib/utils";

type Metric = {
  value: number | string | null;
  available?: boolean;
  currency?: string;
  note?: string;
};

type Overview = {
  metrics?: Record<string, Metric>;
  definitions?: Record<string, string>;
  period?: { days?: number; label?: string };
  source?: string;
  error?: string;
};

function displayMetric(m?: Metric, suffix = "") {
  if (!m || m.available === false || m.value == null) return "Unavailable";
  if (m.currency) {
    return `${m.currency} ${Number(m.value).toLocaleString("en-ET", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${Number(m.value).toLocaleString("en-US")}${suffix}`;
}

export default function MarketplaceOverviewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rangeDays = Number(searchParams.get("range_days") || 30) || 30;

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch(`/api/admin/marketplace/overview?range_days=${rangeDays}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as Overview;
      if (!res.ok) throw new Error(payload.error || "Failed to load overview");
      setData(payload);
      setOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [rangeDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const m = data?.metrics ?? {};

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Marketplace overview"
        description="Services, bookings, opportunities, and fee collections — snapshots vs period activity labeled"
      />

      <div className="flex flex-wrap gap-1.5">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => router.replace(`${pathname}?range_days=${d}`)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium",
              rangeDays === d
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-text-secondary",
            )}
          >
            {d} days
          </button>
        ))}
      </div>

      {data?.period?.label ? (
        <p className="text-xs text-text-hint">{data.period.label}</p>
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

      {loading ? <AdminLoadingRow label="Loading marketplace overview…" /> : null}

      {!loading && ok ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Published services" value={displayMetric(m.published_services)} hint="Snapshot" href="/admin/services?published=yes" />
            <Kpi label="Pending approvals" value={displayMetric(m.pending_approvals)} hint="Snapshot" href="/admin/services?published=pending" />
            <Kpi label="Active providers" value={displayMetric(m.active_providers)} hint="Snapshot" />
            <Kpi label="Pending bookings" value={displayMetric(m.pending_bookings)} hint="Snapshot" href="/admin/requests?status=pending" />
            <Kpi label="Upcoming bookings (14d)" value={displayMetric(m.upcoming_bookings)} hint="Snapshot" href="/admin/requests?status=accepted" />
            <Kpi label="Completed (period)" value={displayMetric(m.completed_bookings_period)} hint="Period" />
            <Kpi label="Cancelled/declined (period)" value={displayMetric(m.closed_bookings_period)} hint="Period" />
            <Kpi label="Verified collections" value={displayMetric(m.verified_collections_etb)} hint="Period · Finance source" href="/admin/finance/transactions?module=service" />
            <Kpi label="Platform commission" value={displayMetric(m.platform_commission_etb)} hint="Unavailable if not recorded" />
            <Kpi label="Open opportunities" value={displayMetric(m.open_opportunities)} hint="Snapshot" href="/admin/opportunities" />
            <Kpi label="Open applications" value={displayMetric(m.open_applications)} hint="Snapshot" href="/admin/opportunities" />
            <Kpi label="Mini apps published" value={displayMetric(m.mini_apps_published)} hint="Snapshot" href="/admin/miniapps" />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Quick href="/admin/services" title="Services" body="Directory, moderation, listing detail" />
            <Quick href="/admin/requests" title="Bookings" body="Operational queue with payment status" />
            <Quick href="/admin/marketplace/settings" title="Settings" body="Categories and subcategories" />
          </div>
        </>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-hint">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-text-hint">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Quick({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md">
      <p className="font-heading text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-text-secondary">{body}</p>
    </Link>
  );
}
