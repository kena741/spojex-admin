import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { slugifyNews } from "@/lib/news";

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
    category?: string;
    source?: string;
    author?: string;
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
  const slug = (payload.slug?.trim() || slugifyNews(title)).toLowerCase();
  const organizationId =
    typeof payload.organization_id === "string" && payload.organization_id.trim()
      ? payload.organization_id.trim()
      : null;
  const { data, error: insertError } = await auth.context.client
    .from("sport_news")
    .insert({
      title,
      slug,
      summary: payload.summary ?? "",
      body: payload.body ?? "",
      image_url: payload.image_url ?? "",
      cover_url: payload.cover_url ?? "",
      category: payload.category ?? "General",
      source: payload.source ?? "SpoJex Desk",
      author: payload.author ?? "",
      status: payload.status ?? "draft",
      is_featured: payload.is_featured ?? false,
      sort_order: payload.sort_order ?? 0,
      published_at: payload.published_at ?? null,
      ...(organizationId ? { organization_id: organizationId } : {}),
    })
    .select()
    .single();
  if (insertError) {
    // Pre-migration DBs lack organization_id — retry without it.
    if (
      organizationId &&
      /organization_id|column .* does not exist/i.test(insertError.message)
    ) {
      const retry = await auth.context.client
        .from("sport_news")
        .insert({
          title,
          slug,
          summary: payload.summary ?? "",
          body: payload.body ?? "",
          image_url: payload.image_url ?? "",
          cover_url: payload.cover_url ?? "",
          category: payload.category ?? "General",
          source: payload.source ?? "SpoJex Desk",
          author: payload.author ?? "",
          status: payload.status ?? "draft",
          is_featured: payload.is_featured ?? false,
          sort_order: payload.sort_order ?? 0,
          published_at: payload.published_at ?? null,
        })
        .select()
        .single();
      if (!retry.error) return NextResponse.json({ data: retry.data });
    }
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${insertError.message}. ${hint}` : insertError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
