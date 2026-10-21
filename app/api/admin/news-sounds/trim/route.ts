import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { toBackendMediaUrl, trimAudioViaSpojexMediaApi } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

export const maxDuration = 180;

/**
 * Trim a library sound clip.
 * Accepts multipart: start_seconds, end_seconds, and either `file` or `audio_url`.
 */
export async function POST(request: Request) {
  const auth = await requireAnyAdminPermission(["sounds:write", "news:write"]);
  if (!auth.ok) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Trim could not start. Refresh and try again." },
      { status: 400 },
    );
  }

  const start = Number(form.get("start_seconds") ?? 0);
  const end = Number(form.get("end_seconds"));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return NextResponse.json(
      { error: "Choose a valid trim range (end after start)." },
      { status: 400 },
    );
  }

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const raw = form.get("file");
  let blob: Blob | null = null;
  let filename = "audio.m4a";

  if (raw instanceof Blob && typeof raw.arrayBuffer === "function" && raw.size > 0) {
    blob = raw;
    const named = raw as Blob & { name?: string };
    if (typeof named.name === "string" && named.name.trim()) {
      filename = named.name.trim();
    }
  } else {
    const audioUrl = toBackendMediaUrl(`${form.get("audio_url") ?? ""}`.trim());
    if (!audioUrl) {
      return NextResponse.json(
        { error: "Upload or select audio before trimming." },
        { status: 400 },
      );
    }
    const base = getSpojexApiBaseUrl();
    const absolute =
      audioUrl.startsWith("http")
        ? audioUrl
        : `${(base || "").replace(/\/$/, "")}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`;
    try {
      const upstream = await fetch(absolute, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "*/*",
        },
        cache: "no-store",
      });
      if (!upstream.ok) {
        return NextResponse.json(
          { error: "Could not download the audio to trim." },
          { status: 400 },
        );
      }
      const bytes = await upstream.arrayBuffer();
      const type = upstream.headers.get("content-type") || "audio/mp4";
      blob = new Blob([bytes], { type });
      const match = audioUrl.match(/\/([^/?#]+)$/);
      if (match?.[1]) filename = match[1];
    } catch {
      return NextResponse.json(
        { error: "Could not download the audio to trim." },
        { status: 400 },
      );
    }
  }

  if (!blob || blob.size <= 0) {
    return NextResponse.json({ error: "Empty audio file." }, { status: 400 });
  }

  try {
    const uploaded = await trimAudioViaSpojexMediaApi({
      accessToken: token,
      file: blob,
      filename,
      startSeconds: Math.max(0, start),
      endSeconds: end,
      module: "news",
      folder: "sport-news/sounds",
    });
    if (!uploaded.publicUrl) {
      return NextResponse.json({ error: "Trim failed. No URL returned." }, { status: 400 });
    }
    return NextResponse.json({
      kind: "audio",
      path: uploaded.path,
      publicUrl: toBackendMediaUrl(uploaded.publicUrl),
      objectId: uploaded.objectId,
      durationSeconds: uploaded.durationSeconds ?? Math.max(0, Math.round(end - start)),
      trimmed: true,
      startSeconds: start,
      endSeconds: end,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Audio trim failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
