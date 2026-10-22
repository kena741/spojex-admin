import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/spojex/admin";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

/** Directory-aligned: Published = active (legacy published accepted). */
function isPublished(status?: string | null) {
  const s = String(status || "").toLowerCase();
  return s === "active" || s === "published";
}
function isDraft(status?: string | null) {
  return String(status || "").toLowerCase() === "draft";
}
function isArchived(status?: string | null) {
  return ["archived", "archive", "hidden"].includes(String(status || "").toLowerCase());
}

async function localOverview(rangeDays: number, start?: string | null, end?: string | null) {
  const client = createAdminClient();
  const now = new Date();
  let since: Date;
  let until: Date = now;
  if (start && end) {
    since = new Date(`${start.slice(0, 10)}T00:00:00.000Z`);
    until = new Date(`${end.slice(0, 10)}T23:59:59.999Z`);
  } else {
    since = new Date(now);
    since.setUTCDate(since.getUTCDate() - (rangeDays - 1));
    since.setUTCHours(0, 0, 0, 0);
  }
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  // Count via head requests — never derive totals from one page of rows.
  const [
    draftHead,
    publishedHead,
    archivedHead,
    featuredHead,
    periodHead,
    soundsActive,
    soundsHidden,
    bannersActive,
    bannersMissing,
    reports,
  ] = await Promise.all([
    client.from("sport_news").select("id", { count: "exact", head: true }).eq("status", "draft"),
    client
      .from("sport_news")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "published"]),
    client
      .from("sport_news")
      .select("id", { count: "exact", head: true })
      .in("status", ["archived", "archive", "hidden"]),
    client
      .from("sport_news")
      .select("id", { count: "exact", head: true })
      .eq("is_featured", true),
    client
      .from("sport_news")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "published"])
      .gte("published_at", sinceIso)
      .lte("published_at", untilIso),
    client
      .from("sport_news_sounds")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    client
      .from("sport_news_sounds")
      .select("id", { count: "exact", head: true })
      .eq("is_active", false),
    client.from("banners").select("id", { count: "exact", head: true }).eq("is_active", true),
    client
      .from("banners")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .or("image_url.is.null,image_url.eq."),
    client
      .from("radio_chat_reports")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "pending", "in_review"]),
  ]);

  // Period fallback when published_at is null: sample recency from a bounded page
  // only if head count is 0 (cannot count null published_at with gte alone).
  let publishedPeriod = periodHead.count ?? 0;
  if (publishedPeriod === 0 && !periodHead.error) {
    const { data } = await client
      .from("sport_news")
      .select("status, published_at, created_at")
      .in("status", ["active", "published"])
      .limit(5000);
    publishedPeriod = ((data ?? []) as Array<{ status?: string; published_at?: string | null; created_at?: string }>).filter(
      (r) => {
        if (!isPublished(r.status)) return false;
        const t = r.published_at || r.created_at;
        return !!t && t >= sinceIso && t <= untilIso;
      },
    ).length;
  }

  const metric = (value: number | null, available = true, reason = "ok", href?: string) => ({
    value: available ? value : null,
    available,
    reason: available && value === 0 ? "measured_zero" : reason,
    href,
  });

  // Silence unused helpers when head counts succeed
  void isDraft;
  void isArchived;

  return {
    generated_at: new Date().toISOString(),
    timezone: "Africa/Addis_Ababa",
    period: {
      days: rangeDays,
      start: sinceIso,
      end: untilIso,
      label: `Last ${rangeDays} days`,
      timezone: "Africa/Addis_Ababa",
    },
    source: "admin_local_fallback",
    definitions: {
      published_news:
        "Snapshot: sport_news status active (or legacy published). Matches Sport News directory.",
      published_period: "Period: coalesce(published_at, created_at) in window among published rows.",
    },
    drilldowns: {
      draft_news: "/admin/news?status=draft",
      published_news: "/admin/news?status=active",
      archived_news: "/admin/news?status=archived",
      published_period: `/admin/news?status=active&published_from=${sinceIso.slice(0, 10)}&published_to=${untilIso.slice(0, 10)}`,
      active_sounds: "/admin/media-library?library=sounds&status=active",
      active_banners: "/admin/banners?status=active",
      banners_missing_image: "/admin/banners?status=active&missing_image=1",
      open_radio_reports: "/admin/radio-chat?tab=reports&status=open",
    },
    metrics: {
      draft_news: metric(draftHead.count ?? 0, !draftHead.error, "ok", "/admin/news?status=draft"),
      published_news: metric(
        publishedHead.count ?? 0,
        !publishedHead.error,
        "ok",
        "/admin/news?status=active",
      ),
      archived_news: metric(
        archivedHead.count ?? 0,
        !archivedHead.error,
        "ok",
        "/admin/news?status=archived",
      ),
      featured_news: metric(featuredHead.count ?? 0, !featuredHead.error),
      published_period: metric(publishedPeriod, true),
      news_impressions_period: metric(null, false, "not_instrumented"),
      news_qualified_views_period: metric(null, false, "not_instrumented"),
      scheduled_content: metric(null, false, "not_implemented"),
      media_processing_failures: metric(null, false, "not_implemented"),
      active_sounds: metric(
        soundsActive.count ?? 0,
        !soundsActive.error,
        "ok",
        "/admin/media-library?library=sounds&status=active",
      ),
      hidden_sounds: metric(soundsHidden.count ?? 0, !soundsHidden.error),
      active_banners: metric(
        bannersActive.count ?? 0,
        !bannersActive.error,
        "ok",
        "/admin/banners?status=active",
      ),
      banners_missing_image: metric(
        bannersMissing.count ?? 0,
        !bannersMissing.error,
        "ok",
        "/admin/banners?status=active&missing_image=1",
      ),
      open_radio_reports: metric(
        reports.count ?? 0,
        !reports.error,
        reports.error ? "failed" : "ok",
        "/admin/radio-chat?tab=reports&status=open",
      ),
      feed_users_with_signals: metric(null, false, "not_instrumented"),
    },
    needs_attention: [],
    capabilities: [
      {
        id: "scheduling",
        label: "Scheduled publishing",
        state: "not_implemented",
      },
      {
        id: "media_processing_jobs",
        label: "Media processing job monitor",
        state: "not_implemented",
      },
    ],
    trends: { bucket: "day", publications: [] },
    content_mix: [],
    recent_publications: [],
    top_content: [],
    reconciliation: {
      published_status_values: ["active", "published"],
      directory_filter: "status=active (alias status=published)",
    },
  };
}

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission([
    "news:read",
    "sounds:read",
    "banners:read",
    "streams:read",
    "reports:read",
    "analytics:read",
  ]);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const rangeDays = Number(url.searchParams.get("range_days") || 30) || 30;
  const range = url.searchParams.get("range");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  const token = await requestAccessToken();
  if (token) {
    try {
      const qs = new URLSearchParams();
      qs.set("range_days", String(rangeDays));
      if (range) qs.set("range", range);
      if (start) qs.set("start", start);
      if (end) qs.set("end", end);
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/content/overview?${qs}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      if (res.status !== 404) {
        return NextResponse.json(
          { error: (payload as { detail?: string }).detail || "Overview failed" },
          { status: res.status },
        );
      }
    } catch {
      // fallback
    }
  }

  try {
    return NextResponse.json(await localOverview(rangeDays, start, end));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Overview failed" },
      { status: 500 },
    );
  }
}
