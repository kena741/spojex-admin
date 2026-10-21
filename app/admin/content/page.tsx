"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { cn } from "@/lib/utils";

type Metric = { value: number | null; available?: boolean; note?: string };
type Overview = {
  metrics?: Record<string, Metric>;
  period?: { label?: string };
  source?: string;
  error?: string;
};

function display(m?: Metric) {
  if (!m || m.available === false || m.value == null) return "Unavailable";
  return Number(m.value).toLocaleString("en-US");
}

export default function ContentOverviewPage() {
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
      const res = await fetch(`/api/admin/content/overview?range_days=${rangeDays}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as Overview;
      if (!res.ok) throw new Error(payload.error || "Failed to load");
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
        title="Content overview"
        description="Publishing, media library, banners, and moderation — missing analytics show as Unavailable, not zero"
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
      {data?.period?.label ? <p className="text-xs text-text-hint">{data.period.label}</p> : null}

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

      {loading ? <AdminLoadingRow label="Loading content overview…" /> : null}

      {!loading && ok ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Draft news" value={display(m.draft_news)} hint="Snapshot" href="/admin/news?status=draft" />
            <Kpi label="Published news" value={display(m.published_news)} hint="Snapshot" href="/admin/news?status=published" />
            <Kpi label="Archived news" value={display(m.archived_news)} hint="Snapshot" />
            <Kpi label="Published (period)" value={display(m.published_period)} hint="Period" />
            <Kpi label="News impressions (period)" value={display(m.news_impressions_period)} hint="≠ video completions" />
            <Kpi label="Qualified views (period)" value={display(m.news_qualified_views_period)} hint="viewed_at set" />
            <Kpi label="Scheduled content" value={display(m.scheduled_content)} hint="Not implemented" />
            <Kpi label="Media processing failures" value={display(m.media_processing_failures)} hint="Job table pending" />
            <Kpi label="Active sounds" value={display(m.active_sounds)} href="/admin/sound-library" />
            <Kpi label="Active banners" value={display(m.active_banners)} href="/admin/banners?status=active" />
            <Kpi label="Banners missing image" value={display(m.banners_missing_image)} href="/admin/banners" />
            <Kpi label="Open radio reports" value={display(m.open_radio_reports)} href="/admin/radio-chat?tab=reports" />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Quick href="/admin/news" title="Sport News" body="Draft, publish, and media stories" />
            <Quick href="/admin/media-library" title="Media Library" body="Sounds and shared audio assets" />
            <Quick href="/admin/feed-insights" title="Feed Insights" body="Preferences vs learned affinities" />
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
