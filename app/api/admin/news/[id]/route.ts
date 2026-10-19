import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

const allowed = [
  "title",
  "slug",
  "summary",
  "body",
  "image_url",
  "cover_url",
  "image_urls",
  "video_url",
  "audio_url",
  "sound_id",
  "category",
  "source",
  "author",
  "status",
  "is_featured",
  "sort_order",
  "published_at",
  "organization_id",
] as const;

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if ("organization_id" in patch) {
    const raw = patch.organization_id;
    patch.organization_id =
      typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }
  if ("sound_id" in patch) {
    const raw = patch.sound_id;
    patch.sound_id =
      typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }
  if ("image_urls" in patch) {
    const urls = normalizeImageUrls(patch.image_urls);
    patch.image_urls = urls;
    const primary = urls[0] ?? "";
    patch.image_url = primary;
    patch.cover_url = primary;
  } else if ("image_url" in patch || "cover_url" in patch) {
    const image = "image_url" in patch ? `${patch.image_url ?? ""}`.trim() : "";
    const cover = "cover_url" in patch ? `${patch.cover_url ?? ""}`.trim() : "";
    const url = image || cover;
    patch.image_url = url;
    patch.cover_url = url;
    if (url) patch.image_urls = [url];
    else patch.image_urls = [];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data: current } = await auth.context.client
    .from("sport_news")
    .select("video_url, audio_url, status, published_at")
    .eq("id", id)
    .maybeSingle();
  const currentVideo = `${current?.video_url ?? ""}`.trim();
  const currentAudio = `${current?.audio_url ?? ""}`.trim();
  const nextStatus = "status" in patch ? `${patch.status ?? ""}` : `${current?.status ?? ""}`;
  const incomingPublished =
    "published_at" in patch && patch.published_at != null && `${patch.published_at}`.trim()
      ? `${patch.published_at}`
      : "";
  if (nextStatus === "active" && !`${current?.published_at ?? ""}`.trim()) {
    patch.published_at = incomingPublished || new Date().toISOString();
  } else if (incomingPublished) {
    patch.published_at = incomingPublished;
  } else if ("published_at" in patch) {
    delete patch.published_at;
  }
  const nextVideo =
    "video_url" in patch ? `${patch.video_url ?? ""}`.trim() : currentVideo;
  const nextAudio =
    "audio_url" in patch ? `${patch.audio_url ?? ""}`.trim() : currentAudio;

  const nextSoundId =
    "sound_id" in patch
      ? patch.sound_id == null
        ? null
        : `${patch.sound_id}`.trim() || null
      : undefined;
  // Library soundtrack on an image story is audio_url + sound_id, not a video conflict
  // unless a video file is already attached.
  if (nextVideo && nextAudio) {
    return NextResponse.json(
      {
        error:
          nextSoundId || currentVideo
            ? "A story can have video or an image soundtrack, not both. Remove the video first."
            : "A story can have video or audio, not both. Remove the current file first.",
      },
      { status: 400 },
    );
  }
  if (currentAudio && nextVideo) {
    return NextResponse.json(
      { error: "Remove the audio / soundtrack before adding video." },
      { status: 400 },
    );
  }
  if (currentVideo && nextAudio) {
    return NextResponse.json(
      { error: "Remove the video file before adding an image soundtrack." },
      { status: 400 },
    );
  }
  if (currentVideo && nextSoundId) {
    return NextResponse.json(
      { error: "Remove the video file before adding an image soundtrack." },
      { status: 400 },
    );
  }

  const { data, error: updateError } = await auth.context.client
    .from("sport_news")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updateError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { error: deleteError } = await auth.context.client.from("sport_news").delete().eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
