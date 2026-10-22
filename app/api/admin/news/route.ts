import { NextResponse } from "next/server";
import type { SpojexClient } from "@/lib/api/client";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { classifyNewsMedia, slugifyNews } from "@/lib/news";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

/** Server-side Sport News directory (filters, pagination, totals) via Python admin API. */
export async function GET(request: Request) {
  const auth = await requireAdminPermission("news:read");
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of [
    "q",
    "status",
    "category",
    "organization_id",
    "media_type",
    "featured",
    "published_from",
    "published_to",
    "sort",
    "order",
    "page",
    "page_size",
  ]) {
    const value = incoming.searchParams.get(key);
    if (value) params.set(key, value);
  }

  const res = await fetch(
    `${getSpojexApiBaseUrl()}/api/v1/admin/news?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      {
        error:
          (payload as { error?: string; message?: string }).error ||
          (payload as { message?: string }).message ||
          "Failed to load news",
      },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}

type NewsInsert = {
  title: string;
  slug: string;
  summary: string;
  body: string;
  image_url: string;
  cover_url: string;
  image_urls: string[];
  video_url: string;
  audio_url: string;
  sound_id?: string | null;
  category: string;
  source: string;
  author: string;
  status: string;
  is_featured: boolean;
  sort_order: number;
  published_at?: string;
  created_at: string;
  updated_at: string;
  like_count: number;
  comment_count: number;
  save_count: number;
  share_count: number;
  organization_id?: string;
};

function normalizeImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const url = `${item ?? ""}`.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out.slice(0, 10);
}

function isSlugConflict(error: { code?: string; message?: string }) {
  return error.code === "23505" || /sport_news_slug_key|duplicate key value/i.test(error.message ?? "");
}

function isMissingOrgColumn(error: { message?: string }) {
  return /organization_id|column .* does not exist/i.test(error.message ?? "");
}

function isMissingImageUrlsColumn(error: { message?: string }) {
  return /image_urls|column .* does not exist/i.test(error.message ?? "");
}

async function uniqueNewsSlug(client: SpojexClient, base: string) {
  const root = base.replace(/^-+|-+$/g, "") || "article";
  for (let n = 0; n < 30; n += 1) {
    const slug = n === 0 ? root : `${root}-${n + 1}`;
    const { data, error } = await client.from("sport_news").select("id").eq("slug", slug).maybeSingle();
    if (error || !data) return error ? `${root}-${Date.now().toString(36)}` : slug;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;
  const payload = (await request.json()) as {
    title?: string;
    slug?: string;
    summary?: string;
    body?: string;
    image_url?: string;
    cover_url?: string;
    image_urls?: string[];
    video_url?: string;
    audio_url?: string;
    sound_id?: string | null;
    category?: string;
    source?: string;
    status?: string;
    is_featured?: boolean;
    sort_order?: number;
    published_at?: string | null;
    organization_id?: string | null;
  };
  const title = payload.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const video = `${payload.video_url ?? ""}`.trim();
  const audio = `${payload.audio_url ?? ""}`.trim();
  const soundId =
    typeof payload.sound_id === "string" && payload.sound_id.trim()
      ? payload.sound_id.trim()
      : null;
  if (video && audio) {
    return NextResponse.json(
      { error: "A story can have video or audio, not both. Remove the current file first." },
      { status: 400 },
    );
  }
  if (video && soundId) {
    return NextResponse.json(
      { error: "Video posts cannot use a library soundtrack." },
      { status: 400 },
    );
  }

  const gallery = normalizeImageUrls(payload.image_urls);
  const single = `${payload.image_url ?? payload.cover_url ?? ""}`.trim();
  const imageUrls = gallery.length > 0 ? gallery : single ? [single] : [];
  const image = imageUrls[0] ?? "";
  const media = classifyNewsMedia({
    video_url: video,
    audio_url: audio,
    sound_id: soundId,
    image_url: image,
    cover_url: image,
    image_urls: imageUrls,
  });
  const author =
    auth.context.staff.full_name?.trim() ||
    auth.context.staff.email?.trim() ||
    "SpoJex Admin";
  const organizationId =
    typeof payload.organization_id === "string" && payload.organization_id.trim()
      ? payload.organization_id.trim()
      : "";
  if (!organizationId) {
    return NextResponse.json(
      { error: "Publishing organization is required." },
      { status: 400 },
    );
  }
  const base = (payload.slug?.trim() || slugifyNews(title) || "article").toLowerCase();
  const slug = await uniqueNewsSlug(auth.context.client, base);
  const now = new Date().toISOString();
  const status = payload.status ?? "draft";
  const publishedAt =
    (typeof payload.published_at === "string" && payload.published_at.trim()) ||
    (status === "active" ? now : "");
  const featured =
    status === "archived" || status === "archive" || status === "hidden"
      ? false
      : (payload.is_featured ?? false);

  const row: NewsInsert & {
    media_type?: string;
    has_soundtrack?: boolean;
    archived_at?: string | null;
  } = {
    title,
    slug,
    summary: payload.summary ?? "",
    body: payload.body ?? "",
    image_url: image,
    cover_url: image,
    image_urls: imageUrls,
    video_url: video,
    audio_url: audio,
    sound_id: soundId,
    category: payload.category ?? "General",
    source:
      typeof payload.source === "string" ? payload.source.trim() : "",
    author,
    status,
    is_featured: featured,
    sort_order: payload.sort_order ?? 0,
    created_at: now,
    updated_at: now,
    like_count: 0,
    comment_count: 0,
    save_count: 0,
    share_count: 0,
    media_type: media.media_type,
    has_soundtrack: media.has_soundtrack,
    ...(publishedAt ? { published_at: publishedAt } : {}),
    ...(status === "archived" || status === "archive" || status === "hidden"
      ? { archived_at: now }
      : {}),
    organization_id: organizationId,
  };

  const insertArticle = (value: NewsInsert) =>
    auth.context.client.from("sport_news").insert(value).select().single();

  let omitOrg = false;
  let omitImageUrls = false;
  let omitMediaMeta = false;
  const stripOptional = (value: typeof row) => {
    let next: Record<string, unknown> = { ...value };
    if (omitOrg) delete next.organization_id;
    if (omitImageUrls) delete next.image_urls;
    if (omitMediaMeta) {
      delete next.media_type;
      delete next.has_soundtrack;
      delete next.archived_at;
    }
    return next as NewsInsert;
  };

  let result = await insertArticle(row as NewsInsert);
  if (
    result.error &&
    /media_type|has_soundtrack|archived_at|column .* does not exist/i.test(
      result.error.message ?? "",
    )
  ) {
    omitMediaMeta = true;
    result = await insertArticle(stripOptional(row));
  }
  if (result.error && organizationId && isMissingOrgColumn(result.error)) {
    omitOrg = true;
    result = await insertArticle(stripOptional(row));
  }
  if (result.error && isMissingImageUrlsColumn(result.error)) {
    omitImageUrls = true;
    result = await insertArticle(stripOptional(row));
  }
  if (result.error && isSlugConflict(result.error)) {
    const retryRow = { ...row, slug: `${slug}-${Date.now().toString(36).slice(-4)}` };
    result = await insertArticle(stripOptional(retryRow));
  }

  if (result.error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${result.error.message}. ${hint}` : result.error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data: result.data });
}
