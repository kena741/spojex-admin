import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let auth = await requireAdminPermission("organizations:read");
  if (!auth.ok) auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const url = new URL(request.url);
  const qs = url.searchParams.toString();

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/organizations/${id}/content?${qs}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
    } catch {
      // local fallback
    }
  }

  const status = (url.searchParams.get("status") || "").trim().toLowerCase();
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 24) || 24, 1), 60);

  let query = auth.context.client
    .from("sport_news")
    .select(
      "id, title, summary, status, image_url, cover_url, video_url, like_count, comment_count, save_count, share_count, published_at, created_at, updated_at",
    )
    .eq("organization_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);

  // UI "published" maps to sport_news status active|published.
  if (status === "published") query = query.in("status", ["active", "published"]);
  else if (status === "hidden") query = query.in("status", ["hidden", "archived"]);
  else if (status) query = query.eq("status", status);
  if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const items = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    content_type: "sport_news",
  }));

  // Gym videos for linked gyms.
  const { data: gyms } = await auth.context.client
    .from("gyms")
    .select("id, name")
    .eq("organization_id", id);
  const gymIds = (gyms ?? []).map((g: { id: string }) => g.id);
  let gymVideos: Record<string, unknown>[] = [];
  if (gymIds.length > 0) {
    const { data: clips } = await auth.context.client
      .from("gym_videos")
      .select(
        "id, title, caption, thumbnail_url, video_url, like_count, comment_count, save_count, is_draft, is_active, duration_seconds, created_at, updated_at, gym_id",
      )
      .in("gym_id", gymIds)
      .order("created_at", { ascending: false })
      .limit(40);
    const gymNameById = new Map(
      (gyms ?? []).map((g: { id: string; name: string }) => [g.id, g.name]),
    );
    gymVideos = (clips ?? []).map((c: Record<string, unknown>) => ({
      id: c.id,
      title: c.title,
      summary: c.caption,
      status: c.is_draft ? "draft" : c.is_active ? "published" : "hidden",
      image_url: c.thumbnail_url,
      cover_url: c.thumbnail_url,
      video_url: c.video_url,
      like_count: c.like_count,
      comment_count: c.comment_count,
      save_count: c.save_count,
      share_count: 0,
      published_at: c.created_at,
      created_at: c.created_at,
      updated_at: c.updated_at,
      duration_seconds: c.duration_seconds,
      content_type: "gym_video",
      gym_id: c.gym_id,
      gym_name: gymNameById.get(String(c.gym_id)) ?? null,
    }));
    if (status === "published") gymVideos = gymVideos.filter((g) => g.status === "published");
    else if (status === "draft") gymVideos = gymVideos.filter((g) => g.status === "draft");
    else if (status === "hidden") gymVideos = gymVideos.filter((g) => g.status === "hidden");
    else if (status === "processing") gymVideos = [];
  }

  return NextResponse.json({
    ok: true,
    organization_id: id,
    items,
    gym_videos: gymVideos,
    next_cursor: null,
    source: "local",
  });
}
