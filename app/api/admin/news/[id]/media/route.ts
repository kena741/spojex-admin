import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSupabaseUrl } from "@/lib/env";

export const maxDuration = 60;

const VIDEO_MAX = 50 * 1024 * 1024;
const AUDIO_MAX = 20 * 1024 * 1024;
const IMAGE_MAX = 5 * 1024 * 1024;

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"]);
const AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/x-m4a",
]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type MediaKind = "video" | "audio" | "thumbnail" | "cover";

function asKind(value: string): MediaKind | null {
  if (value === "video" || value === "audio" || value === "thumbnail" || value === "cover") {
    return value;
  }
  return null;
}

function extensionFor(kind: MediaKind, type: string, filename: string) {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (match?.[1]) return match[1];
  if (kind === "audio") {
    if (type.includes("wav")) return "wav";
    if (type.includes("ogg")) return "ogg";
    if (type.includes("aac") || type.includes("mp4") || type.includes("m4a")) return "m4a";
    return "mp3";
  }
  if (kind === "video") {
    if (type === "video/webm") return "webm";
    if (type === "video/quicktime") return "mov";
    return "mp4";
  }
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

function validate(kind: MediaKind, type: string, filename: string, size: number) {
  if (kind === "video") {
    if (!VIDEO_TYPES.has(type) && !/\.(mp4|webm|mov|m4v)$/i.test(filename)) {
      return "Use an MP4, WebM, or MOV video.";
    }
    if (size > VIDEO_MAX) return "Video must be 50 MB or smaller.";
    return null;
  }
  if (kind === "audio") {
    if (!AUDIO_TYPES.has(type) && !/\.(mp3|m4a|aac|wav|ogg)$/i.test(filename)) {
      return "Use an MP3, M4A, AAC, WAV, or OGG audio file.";
    }
    if (size > AUDIO_MAX) return "Audio must be 20 MB or smaller.";
    return null;
  }
  if (!IMAGE_TYPES.has(type) && !/\.(jpe?g|png|webp|gif)$/i.test(filename)) {
    return "Use a JPG, PNG, WebP, or GIF image.";
  }
  if (size > IMAGE_MAX) return "Image must be 5 MB or smaller.";
  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Upload could not start. Refresh and try again." },
      { status: 400 },
    );
  }

  const kind = asKind(`${body.kind ?? ""}`.trim().toLowerCase());
  const filename = `${body.filename ?? "file"}`;
  const contentType = `${body.contentType ?? ""}`;
  const size = Number(body.size ?? 0);
  if (!kind) {
    return NextResponse.json({ error: "kind must be video, audio, thumbnail, or cover." }, { status: 400 });
  }
  const invalid = validate(kind, contentType, filename, size);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  const { data: article, error: loadError } = await auth.context.client
    .from("sport_news")
    .select("id, video_url, audio_url")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }
  const hasVideo = Boolean(`${article.video_url ?? ""}`.trim());
  const hasAudio = Boolean(`${article.audio_url ?? ""}`.trim());
  if (kind === "video" && hasAudio) {
    return NextResponse.json(
      { error: "Remove the audio file before uploading video." },
      { status: 400 },
    );
  }
  if (kind === "audio" && hasVideo) {
    return NextResponse.json(
      { error: "Remove the video file before uploading audio." },
      { status: 400 },
    );
  }

  const ext = extensionFor(kind, contentType, filename);
  const path = `${id}/${kind}-${Date.now()}.${ext}`;
  const { data: signed, error: signError } = await auth.context.client.storage
    .from("sport-news")
    .createSignedUploadUrl(path, { upsert: true });

  if (signError || !signed?.token) {
    const hint = missingServiceRoleMessage();
    const message = (signError?.message || "Could not create upload URL").includes("Bucket not found")
      ? `${signError?.message}. Run supabase/migrations/074_news_media.sql in Supabase.`
      : signError?.message || "Could not create upload URL";
    return NextResponse.json({ error: hint ? `${message}. ${hint}` : message }, { status: 400 });
  }

  const { data: publicData } = auth.context.client.storage.from("sport-news").getPublicUrl(path);
  const publicUrl =
    publicData.publicUrl || `${getSupabaseUrl()}/storage/v1/object/public/sport-news/${path}`;

  return NextResponse.json({
    kind,
    path,
    token: signed.token,
    publicUrl,
  });
}
