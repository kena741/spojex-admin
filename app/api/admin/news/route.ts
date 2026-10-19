import { NextResponse } from "next/server";
import type { SpojexClient } from "@/lib/api/client";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { slugifyNews } from "@/lib/news";

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
  const author =
    auth.context.staff.full_name?.trim() ||
    auth.context.staff.email?.trim() ||
    "SpoJex Admin";
  const organizationId =
    typeof payload.organization_id === "string" && payload.organization_id.trim()
      ? payload.organization_id.trim()
      : null;
  const base = (payload.slug?.trim() || slugifyNews(title) || "article").toLowerCase();
  const slug = await uniqueNewsSlug(auth.context.client, base);
  const now = new Date().toISOString();
  const status = payload.status ?? "draft";
  const publishedAt =
    (typeof payload.published_at === "string" && payload.published_at.trim()) ||
    (status === "active" ? now : "");

  const row: NewsInsert = {
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
    source: payload.source ?? "SpoJex Desk",
    author,
    status,
    is_featured: payload.is_featured ?? false,
    sort_order: payload.sort_order ?? 0,
    created_at: now,
    updated_at: now,
    like_count: 0,
    comment_count: 0,
    save_count: 0,
    share_count: 0,
    ...(publishedAt ? { published_at: publishedAt } : {}),
    ...(organizationId ? { organization_id: organizationId } : {}),
  };

  const insertArticle = (value: NewsInsert) =>
    auth.context.client.from("sport_news").insert(value).select().single();

  let omitOrg = false;
  let omitImageUrls = false;
  const stripOptional = (value: NewsInsert) => {
    let next: NewsInsert = value;
    if (omitOrg) {
      const { organization_id: _organizationId, ...rest } = next;
      next = rest as NewsInsert;
    }
    if (omitImageUrls) {
      const { image_urls: _imageUrls, ...rest } = next as NewsInsert & {
        image_urls?: string[];
      };
      next = rest as NewsInsert;
    }
    return next;
  };

  let result = await insertArticle(row);
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
