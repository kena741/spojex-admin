import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { classifyNewsMedia } from "@/lib/news";
import { requestAccessToken } from "@/lib/spojex/server";

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

function isMissingColumn(error: { message?: string }, column: string) {
  return new RegExp(`${column}|column .* does not exist`, "i").test(error.message ?? "");
}

/** Prefer Python admin actions for business rules; fall back to direct patch if API unavailable. */
async function pythonSave(
  id: string,
  patch: Record<string, unknown>,
  token: string,
) {
  const res = await fetch(
    `${getSpojexApiBaseUrl()}/api/v1/admin/news/${id}/actions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "save", patch }),
      cache: "no-store",
    },
  );
  const payload = await res.json().catch(() => ({}));
  return { res, payload };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const orgId = typeof raw === "string" ? raw.trim() : "";
    if (!orgId) {
      return NextResponse.json(
        { error: "Publishing organization is required." },
        { status: 400 },
      );
    }
    patch.organization_id = orgId;
  }
  if ("sound_id" in patch) {
    const raw = patch.sound_id;
    patch.sound_id =
      typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }
  if ("source" in patch) {
    patch.source = typeof patch.source === "string" ? patch.source.trim() : "";
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

  const token = await requestAccessToken();
  if (token) {
    // Map common status verbs to dedicated actions when only status is changing
    const statusOnly =
      Object.keys(patch).length === 1 && typeof patch.status === "string";
    if (statusOnly) {
      const next = `${patch.status}`.toLowerCase();
      const action =
        next === "active" || next === "published"
          ? "publish"
          : next === "archived" || next === "archive" || next === "hidden"
            ? "archive"
            : next === "draft"
              ? "restore_draft"
              : "save";
      const actionBody =
        action === "save" ? { action: "save", patch } : { action };
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/news/${id}/actions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(actionBody),
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        const workspace = (payload as { workspace?: { article?: unknown } })
          .workspace;
        return NextResponse.json({
          data: workspace?.article ?? payload,
          workspace,
        });
      }
    } else {
      const { res, payload } = await pythonSave(id, patch, token);
      if (res.ok) {
        const workspace = (payload as { workspace?: { article?: unknown } })
          .workspace;
        return NextResponse.json({
          data: workspace?.article ?? payload,
          workspace,
        });
      }
      // Fall through to local patch only when Python is unreachable / not deployed yet
      if (res.status !== 404 && res.status < 500) {
        return NextResponse.json(
          {
            error:
              (payload as { error?: string; message?: string }).error ||
              (payload as { message?: string }).message ||
              "Save failed",
          },
          { status: res.status },
        );
      }
    }
  }

  const { data: current } = await auth.context.client
    .from("sport_news")
    .select(
      "video_url, audio_url, sound_id, image_url, cover_url, image_urls, status, published_at, is_featured, archived_at",
    )
    .eq("id", id)
    .maybeSingle();
  const currentVideo = `${current?.video_url ?? ""}`.trim();
  const currentAudio = `${current?.audio_url ?? ""}`.trim();
  const nextStatus = "status" in patch ? `${patch.status ?? ""}` : `${current?.status ?? ""}`;
  const statusLower = nextStatus.toLowerCase();
  const incomingPublished =
    "published_at" in patch && patch.published_at != null && `${patch.published_at}`.trim()
      ? `${patch.published_at}`
      : "";
  if (
    (statusLower === "active" || statusLower === "published") &&
    !`${current?.published_at ?? ""}`.trim()
  ) {
    patch.published_at = incomingPublished || new Date().toISOString();
  } else if (incomingPublished) {
    patch.published_at = incomingPublished;
  } else if ("published_at" in patch) {
    delete patch.published_at;
  }

  // Preserve historical published_at when archiving; clear featured; stamp archived_at
  if (statusLower === "archived" || statusLower === "archive" || statusLower === "hidden") {
    patch.is_featured = false;
    if (!current?.archived_at) {
      patch.archived_at = new Date().toISOString();
    }
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
      : current?.sound_id ?? null;
  const nextImageUrls =
    "image_urls" in patch
      ? normalizeImageUrls(patch.image_urls)
      : normalizeImageUrls(current?.image_urls);
  const nextImage =
    "image_url" in patch
      ? `${patch.image_url ?? ""}`.trim()
      : `${current?.image_url ?? ""}`.trim();
  const nextCover =
    "cover_url" in patch
      ? `${patch.cover_url ?? ""}`.trim()
      : `${current?.cover_url ?? ""}`.trim();

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

  const media = classifyNewsMedia({
    video_url: nextVideo,
    audio_url: nextAudio,
    sound_id: nextSoundId,
    image_url: nextImage,
    cover_url: nextCover,
    image_urls: nextImageUrls,
  });
  patch.media_type = media.media_type;
  patch.has_soundtrack = media.has_soundtrack;

  let result = await auth.context.client
    .from("sport_news")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (result.error && isMissingColumn(result.error, "media_type")) {
    const { media_type: _mt, has_soundtrack: _hs, archived_at: _aa, ...rest } = patch;
    result = await auth.context.client
      .from("sport_news")
      .update(rest)
      .eq("id", id)
      .select()
      .maybeSingle();
  }
  if (result.error && isMissingColumn(result.error, "archived_at")) {
    const { archived_at: _aa, ...rest } = patch;
    result = await auth.context.client
      .from("sport_news")
      .update(rest)
      .eq("id", id)
      .select()
      .maybeSingle();
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { error: deleteError } = await auth.context.client
    .from("sport_news")
    .delete()
    .eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
