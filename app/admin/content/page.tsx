"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { cn, formatDateTime } from "@/lib/utils";

type Metric = {
  value: number | null;
  available?: boolean;
  note?: string;
  reason?: string;
  href?: string;
};

type Article = {
  id: string;
  title: string;
  status_label?: string;
  thumbnail?: string | null;
  media_type?: string;
  organization_name?: string | null;
  published_at?: string | null;
  href?: string;
  metrics?: {
    basis?: string;
    likes?: number;
    comments?: number;
    saves?: number;
    note?: string;
  };
};

type Overview = {
  metrics?: Record<string, Metric>;
  period?: { label?: string; timezone?: string; start?: string; end?: string; days?: number };
  previous_period?: { published_count?: number };
  needs_attention?: Array<{
    code: string;
    label: string;
    count: number;
    href: string;
    severity?: string;
    oldest_age_hours?: number | null;
  }>;
  capabilities?: Array<{ id: string; label: string; state: string; note?: string }>;
  trends?: { bucket?: string; publications?: Array<{ day: string | null; count: number }> };
  content_mix?: Array<{ media_type: string; count: number }>;
  recent_publications?: Article[];
  top_content?: Article[];
  operational?: {
    sounds?: { active?: number; hidden?: number; href?: string };
    banners?: { active?: number; missing_image?: number; href?: string };
    moderation?: {
      open_radio_reports?: number | null;
      oldest_open_age_hours?: number | null;
      href?: string;
    };
    feed_insights?: { users_with_signals?: number | null; href?: string; note?: string };
  };
  drilldowns?: Record<string, string>;
  definitions?: Record<string, string>;
  source?: string;
  generated_at?: string;
  error?: string;
};

function display(m?: Metric) {
  if (!m || m.available === false || m.value == null) return "Unavailable";
  return Number(m.value).toLocaleString("en-US");
}

function metricHref(m?: Metric, fallback?: string) {
  return m?.href || fallback || undefined;
}

export default function ContentOverviewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rangeDays = Number(searchParams.get("range_days") || 30) || 30;
  const range = searchParams.get("range") || "";
  const customStart = searchParams.get("start") || "";
  const customEnd = searchParams.get("end") || "";

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const writeParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    setOk(false);
    try {
      const qs = new URLSearchParams();
      qs.set("range_days", String(rangeDays));
      if (range) qs.set("range", range);
      if (range === "custom" && customStart && customEnd) {
        qs.set("start", customStart);
        qs.set("end", customEnd);
      }
      const res = await fetch(`/api/admin/content/overview?${qs}`, { cache: "no-store" });
      const payload = (await res.json()) as Overview;
      if (seq !== loadSeq.current) return;
      if (!res.ok) throw new Error(payload.error || "Failed to load");
      setData(payload);
      setOk(true);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof Error ? err.message : "Failed to load");
      setData(null);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [customEnd, customStart, range, rangeDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const m = data?.metrics ?? {};
  const drills = data?.drilldowns ?? {};
  const pubs = data?.trends?.publications ?? [];
  const trendMax = Math.max(1, ...pubs.map((p) => p.count || 0));

  const prevDelta = useMemo(() => {
    const cur = m.published_period?.value;
    const prev = data?.previous_period?.published_count;
    if (cur == null || prev == null) return null;
    const diff = cur - prev;
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff.toLocaleString("en-US")} vs prior period`;
  }, [data?.previous_period?.published_count, m.published_period?.value]);

  const unsupported = (data?.capabilities ?? []).filter(
    (c) => c.state === "not_implemented" || c.state === "not_instrumented",
  );

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Content overview"
        description="Publishing health for Sport News, media, banners, and moderation — snapshots stay separate from period activity."
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium"
          >
            Refresh
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        <span>{data?.period?.label || `Last ${rangeDays} days`}</span>
        <span>· {data?.period?.timezone || "Africa/Addis_Ababa"}</span>
        {updatedAt ? <span>· Updated {formatDateTime(updatedAt)}</span> : null}
        {data?.source === "admin_local_fallback" ? (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">
            Local fallback
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          { days: 7, key: "7d" },
          { days: 30, key: "30d" },
          { days: 90, key: "90d" },
        ].map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() =>
              writeParams({
                range_days: String(r.days),
                range: r.key,
                start: null,
                end: null,
              })
            }
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium",
              rangeDays === r.days && range !== "custom"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-text-secondary",
            )}
          >
            {r.days} days
          </button>
        ))}
        <button
          type="button"
          onClick={() => writeParams({ range: "custom", range_days: String(rangeDays) })}
          className={cn(
            "rounded-md border px-2.5 py-1.5 text-xs font-medium",
            range === "custom"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-text-secondary",
          )}
        >
          Custom
        </button>
      </div>

      {range === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            Start
            <input
              type="date"
              value={customStart}
              onChange={(e) =>
                writeParams({
                  range: "custom",
                  start: e.target.value,
                  end: customEnd || e.target.value,
                })
              }
              className="mt-1 block h-9 rounded-lg border border-border bg-card px-2 text-sm"
            />
          </label>
          <label className="text-xs">
            End
            <input
              type="date"
              value={customEnd}
              onChange={(e) =>
                writeParams({
                  range: "custom",
                  start: customStart || e.target.value,
                  end: e.target.value,
                })
              }
              className="mt-1 block h-9 rounded-lg border border-border bg-card px-2 text-sm"
            />
          </label>
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

      {loading ? <AdminLoadingRow label="Loading content overview…" /> : null}

      {!loading && ok ? (
        <>
          <section className="space-y-3">
            <h2 className="font-heading text-sm font-semibold">Publishing summary</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                label="Published content"
                value={display(m.published_news)}
                hint="Snapshot — currently published"
                href={metricHref(m.published_news, drills.published_news)}
                primary
              />
              <Kpi
                label="Drafts awaiting work"
                value={display(m.draft_news)}
                hint="Snapshot"
                href={metricHref(m.draft_news, drills.draft_news)}
                primary
              />
              <Kpi
                label="Published during period"
                value={display(m.published_period)}
                hint={prevDelta || "Period activity"}
                href={metricHref(m.published_period, drills.published_period)}
                primary
              />
              <Kpi
                label="Qualified views (period)"
                value={display(m.news_qualified_views_period)}
                hint={
                  m.news_qualified_views_period?.available === false
                    ? "Not instrumented yet"
                    : "Feed exposures with a view"
                }
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <MiniStat
                label="Archived"
                value={display(m.archived_news)}
                href={metricHref(m.archived_news, drills.archived_news)}
              />
              <MiniStat
                label="Impressions (period)"
                value={display(m.news_impressions_period)}
              />
              <MiniStat label="Featured" value={display(m.featured_news)} />
            </div>
          </section>

          {(data?.needs_attention?.length ?? 0) > 0 ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <h2 className="mb-2 font-heading text-sm font-semibold text-amber-950">
                Needs attention
              </h2>
              <ul className="space-y-2">
                {(data?.needs_attention ?? []).map((item) => (
                  <li
                    key={item.code}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      {item.label}{" "}
                      <span className="text-xs text-amber-900/80">({item.count})</span>
                      {item.oldest_age_hours != null ? (
                        <span className="ml-2 text-[11px] text-text-hint">
                          oldest {item.oldest_age_hours}h
                        </span>
                      ) : null}
                    </span>
                    <Link href={item.href} className="text-xs font-medium text-primary hover:underline">
                      Review
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-3 font-heading text-sm font-semibold">
                Publications over time ({data?.trends?.bucket || "day"})
              </h2>
              {pubs.length === 0 ? (
                <p className="text-sm text-text-secondary">No publications in this period.</p>
              ) : (
                <>
                  <div className="flex h-24 items-end gap-1" role="img" aria-label="Publications trend">
                    {pubs.map((p) => (
                      <div
                        key={p.day || Math.random()}
                        title={`${p.day}: ${p.count}`}
                        className="flex-1 rounded-t bg-primary/80"
                        style={{ height: `${Math.max(4, (p.count / trendMax) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <table className="mt-3 min-w-full text-left text-xs">
                    <thead className="text-text-secondary">
                      <tr>
                        <th className="py-1 font-semibold">Period</th>
                        <th className="py-1 font-semibold">Publications</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pubs.slice(-10).map((p) => (
                        <tr key={`row-${p.day}`} className="border-t border-border">
                          <td className="py-1">{p.day}</td>
                          <td className="py-1 tabular-nums">{p.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-3 font-heading text-sm font-semibold">
                Published content mix
              </h2>
              {(data?.content_mix?.length ?? 0) === 0 ? (
                <p className="text-sm text-text-secondary">No published content yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {(data?.content_mix ?? []).map((row) => (
                    <li key={row.media_type} className="flex justify-between">
                      <span className="capitalize text-text-secondary">{row.media_type}</span>
                      <span className="tabular-nums font-medium">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <ArticleList
              title="Recent publications"
              empty="No recent publications."
              items={data?.recent_publications ?? []}
            />
            <ArticleList
              title="Top content"
              empty="No engagement data yet."
              items={data?.top_content ?? []}
              showLifetime
            />
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <OpCard
              title="Media"
              body={`Active sounds ${data?.operational?.sounds?.active ?? "—"} · Hidden ${data?.operational?.sounds?.hidden ?? "—"}`}
              href={data?.operational?.sounds?.href || "/admin/media-library"}
              note="Ordinary active sounds are not treated as problems."
            />
            <OpCard
              title="Banners"
              body={`Active ${data?.operational?.banners?.active ?? "—"} · Missing image ${data?.operational?.banners?.missing_image ?? "—"}`}
              href={data?.operational?.banners?.href || "/admin/banners"}
            />
            <OpCard
              title="Moderation"
              body={
                data?.operational?.moderation?.open_radio_reports == null
                  ? "Radio reports unavailable"
                  : `${data.operational.moderation.open_radio_reports} open reports`
              }
              href={data?.operational?.moderation?.href || "/admin/radio-chat?tab=reports"}
            />
          </section>

          <div className="grid gap-3 md:grid-cols-3">
            <Quick href="/admin/news" title="Sport News" body="Draft, publish, and media stories" />
            <Quick href="/admin/media-library" title="Media Library" body="Sounds and shared audio assets" />
            <Quick
              href="/admin/feed-insights"
              title="Feed Insights"
              body={data?.operational?.feed_insights?.note || "Preferences vs learned affinities"}
            />
          </div>

          {unsupported.length > 0 ? (
            <details className="rounded-xl border border-border bg-card p-4 text-xs text-text-secondary">
              <summary className="cursor-pointer font-medium text-foreground">
                Data availability & capabilities
              </summary>
              <ul className="mt-2 space-y-1.5">
                {unsupported.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium text-foreground">{c.label}</span>
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                      {c.state.replace(/_/g, " ")}
                    </span>
                    {c.note ? <span className="ml-2">{c.note}</span> : null}
                  </li>
                ))}
              </ul>
              {(data?.definitions ? Object.entries(data.definitions) : []).length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-4">
                  {Object.entries(data.definitions ?? {}).map(([k, v]) => (
                    <li key={k}>
                      <span className="font-medium text-foreground">{k}:</span> {v}
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
          ) : null}
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
  primary,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  primary?: boolean;
}) {
  const inner = (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm",
        primary && "ring-1 ring-border",
        href && "transition-shadow hover:shadow-md",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-hint">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-text-hint">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function MiniStat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] text-text-hint">{label}</p>
      <p className="font-heading text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function ArticleList({
  title,
  empty,
  items,
  showLifetime,
}: {
  title: string;
  empty: string;
  items: Article[];
  showLifetime?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 font-heading text-sm font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3">
              {item.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnail}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-text-hint">
                  {item.media_type || "—"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Link
                  href={item.href || `/admin/news?q=${item.id}`}
                  className="line-clamp-2 text-sm font-medium hover:text-primary"
                >
                  {item.title}
                </Link>
                <p className="mt-0.5 text-[11px] text-text-hint">
                  {item.organization_name || "No org"} · {item.media_type || "—"} ·{" "}
                  {item.status_label || "—"}
                  {item.published_at ? ` · ${formatDateTime(item.published_at)}` : ""}
                </p>
                {showLifetime && item.metrics ? (
                  <p className="mt-0.5 text-[11px] text-text-secondary">
                    Lifetime · {item.metrics.likes ?? 0} likes · {item.metrics.comments ?? 0}{" "}
                    comments · {item.metrics.saves ?? 0} saves
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OpCard({
  title,
  body,
  href,
  note,
}: {
  title: string;
  body: string;
  href: string;
  note?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <p className="font-heading text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-text-secondary">{body}</p>
      {note ? <p className="mt-1 text-[11px] text-text-hint">{note}</p> : null}
    </Link>
  );
}

function Quick({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md"
    >
      <p className="font-heading text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-text-secondary">{body}</p>
    </Link>
  );
}
