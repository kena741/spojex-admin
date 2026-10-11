import { NextResponse } from "next/server";
import type { SpojexClient as SupabaseClient } from "@/lib/api/client";
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
  video_url: string;
  audio_url: string;
  category: string;
  source: string;
  author: string;
  status: string;
  is_featured: boolean;
  sort_order: number;
  published_at: string | null;
  organization_id?: string;
};

function isSlugConflict(error: { code?: string; message?: string }) {
  return error.code === "23505" || /sport_news_slug_key|duplicate key value/i.test(error.message ?? "");
}

function isMissingOrgColumn(error: { message?: string }) {
  return /organization_id|column .* does not exist/i.test(error.message ?? "");
}

async function uniqueNewsSlug(client: SupabaseClient, base: string) {
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
    video_url?: string;
    audio_url?: string;
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
  if (video && audio) {
    return NextResponse.json(
      { error: "A story can have video or audio, not both. Remove the current file first." },
      { status: 400 },
    );
  }

  const image = `${payload.image_url ?? payload.cover_url ?? ""}`.trim();
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

  const row: NewsInsert = {
    title,
    slug,
    summary: payload.summary ?? "",
    body: payload.body ?? "",
    image_url: image,
    cover_url: image,
    video_url: video,
    audio_url: audio,
    category: payload.category ?? "General",
    source: payload.source ?? "SpoJex Desk",
    author,
    status: payload.status ?? "draft",
    is_featured: payload.is_featured ?? false,
    sort_order: payload.sort_order ?? 0,
    published_at:
      payload.published_at ??
      ((payload.status ?? "draft") === "active" ? new Date().toISOString() : null),
    ...(organizationId ? { organization_id: organizationId } : {}),
  };

  const insertArticle = (value: NewsInsert) =>
    auth.context.client.from("sport_news").insert(value).select().single();

  let omitOrg = false;
  let result = await insertArticle(row);
  if (result.error && organizationId && isMissingOrgColumn(result.error)) {
    omitOrg = true;
    const { organization_id: _organizationId, ...withoutOrg } = row;
    result = await insertArticle(withoutOrg);
  }
  if (result.error && isSlugConflict(result.error)) {
    const retryRow = { ...row, slug: `${slug}-${Date.now().toString(36).slice(-4)}` };
    if (omitOrg) {
      const { organization_id: _organizationId, ...withoutOrg } = retryRow;
      result = await insertArticle(withoutOrg);
    } else {
      result = await insertArticle(retryRow);
    }
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
