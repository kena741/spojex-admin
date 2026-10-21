import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/spojex/admin";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

async function localOverview(rangeDays: number) {
  const client = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - (rangeDays - 1));
  const sinceIso = since.toISOString();

  const [news, sounds, banners, reports] = await Promise.all([
    client.from("sport_news").select("id, status, is_featured, published_at, created_at"),
    client.from("sport_news_sounds").select("id, is_active"),
    client.from("banners").select("id, is_active, image_url"),
    client
      .from("radio_chat_reports")
      .select("id, status")
      .in("status", ["open", "pending", "in_review"])
      .limit(500),
  ]);

  type News = {
    status?: string;
    is_featured?: boolean;
    published_at?: string | null;
    created_at?: string;
  };
  const rows = (news.data ?? []) as News[];
  const metric = (value: number | null, available = true, note?: string) => ({
    value: available ? value : null,
    available,
    note,
  });

  const draft = rows.filter((r) => String(r.status).toLowerCase() === "draft").length;
  const published = rows.filter((r) => String(r.status).toLowerCase() === "published").length;
  const archived = rows.filter((r) =>
    ["archived", "archive", "hidden"].includes(String(r.status).toLowerCase()),
  ).length;
  const featured = rows.filter((r) => r.is_featured).length;
  const publishedPeriod = rows.filter((r) => {
    if (String(r.status).toLowerCase() !== "published") return false;
    const t = r.published_at || r.created_at;
    return t && t >= sinceIso;
  }).length;

  const soundRows = (sounds.data ?? []) as Array<{ is_active?: boolean }>;
  const bannerRows = (banners.data ?? []) as Array<{ is_active?: boolean; image_url?: string }>;

  return {
    generated_at: new Date().toISOString(),
    period: { days: rangeDays, label: `Last ${rangeDays} days` },
    source: "admin_local_fallback",
    metrics: {
      draft_news: metric(draft),
      published_news: metric(published),
      archived_news: metric(archived),
      featured_news: metric(featured),
      published_period: metric(publishedPeriod),
      news_impressions_period: metric(null, false, "Use Python analytics when deployed"),
      news_qualified_views_period: metric(null, false),
      scheduled_content: metric(null, false, "Scheduling not implemented"),
      media_processing_failures: metric(null, false, "No processing job table"),
      active_sounds: metric(
        sounds.error ? null : soundRows.filter((s) => s.is_active !== false).length,
        !sounds.error,
      ),
      hidden_sounds: metric(
        sounds.error ? null : soundRows.filter((s) => s.is_active === false).length,
        !sounds.error,
      ),
      active_banners: metric(
        banners.error ? null : bannerRows.filter((b) => b.is_active).length,
        !banners.error,
      ),
      banners_missing_image: metric(
        banners.error
          ? null
          : bannerRows.filter((b) => b.is_active && !(b.image_url || "").trim()).length,
        !banners.error,
      ),
      open_radio_reports: metric(reports.error ? null : (reports.data ?? []).length, !reports.error),
      feed_users_with_signals: metric(null, false, "Prefer Python overview"),
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

  const rangeDays = Number(new URL(request.url).searchParams.get("range_days") || 30) || 30;
  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/content/overview?range_days=${rangeDays}`,
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
    return NextResponse.json(await localOverview(rangeDays));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Overview failed" },
      { status: 500 },
    );
  }
}
