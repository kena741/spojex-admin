import { NextResponse } from "next/server";
import {
  isNewsVideoFile,
  newsMediaExtension,
  parseNewsUploadKind,
  resolveNewsMime,
  validateLibrarySound,
  validateNewsMedia,
  type NewsUploadKind,
} from "@/lib/news-media";
import {
  extractAudioViaSpojexMediaApi,
  removeWatermarkViaSpojexMediaApi,
  signUploadComplete,
  toBackendMediaUrl,
  trimVideoViaSpojexMediaApi,
  uploadViaSpojexMediaApi,
} from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

/** Cloud Run request body limit is ~32MB; stay under that for multipart proxy. */
const MULTIPART_SAFE_BYTES = 28 * 1024 * 1024;

async function downloadNewsVideoBlob(
  sourceUrlRaw: string,
  token: string,
): Promise<{ blob: Blob; filename: string } | NextResponse> {
  const fetchUrl = toBackendMediaUrl(sourceUrlRaw);
  let videoRes: Response;
  try {
    videoRes = await fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not download the uploaded video." },
      { status: 400 },
    );
  }
  if (!videoRes.ok) {
    return NextResponse.json(
      { error: `Could not download video (${videoRes.status}). Re-upload and try again.` },
      { status: 400 },
    );
  }
  const bytes = new Uint8Array(await videoRes.arrayBuffer());
  if (bytes.byteLength <= 0) {
    return NextResponse.json({ error: "Downloaded video was empty." }, { status: 400 });
  }
  if (bytes.byteLength > MULTIPART_SAFE_BYTES) {
    return NextResponse.json(
      {
        error: "Video must be under 28 MB to edit. Compress the clip first.",
      },
      { status: 400 },
    );
  }
  const contentType =
    (videoRes.headers.get("content-type") || "").split(";")[0].trim() || "video/mp4";
  const blob = new Blob([bytes], {
    type: contentType.startsWith("video/") ? contentType : "video/mp4",
  });
  const match = fetchUrl.match(/\/([^/?#]+)$/);
  const filename = match?.[1] || `video-${Date.now()}.mp4`;
  return { blob, filename };
}

export type WatermarkPreset = "tiktok" | "instagram" | "both";
export type WatermarkMode = "delogo" | "crop_bottom";

function parseWatermarkPreset(raw: FormDataEntryValue | null): WatermarkPreset | null {
  const value = `${raw ?? ""}`.trim().toLowerCase();
  if (value === "tiktok" || value === "instagram" || value === "both") return value;
  return null;
}

function parseWatermarkMode(raw: FormDataEntryValue | null): WatermarkMode {
  const value = `${raw ?? ""}`.trim().toLowerCase();
  return value === "crop_bottom" ? "crop_bottom" : "delogo";
}

/**
 * Re-process an already-uploaded news video: download → ffmpeg watermark removal → store.
 * Used after the editor can preview the original upload.
 */
export async function removeNewsVideoWatermarkFromForm(
  form: FormData,
  folder: string,
): Promise<NextResponse> {
  const sourceUrlRaw = `${form.get("source_url") ?? form.get("sourceUrl") ?? ""}`.trim();
  if (!sourceUrlRaw) {
    return NextResponse.json({ error: "source_url is required" }, { status: 400 });
  }

  const preset = parseWatermarkPreset(form.get("watermark") ?? form.get("preset"));
  if (!preset) {
    return NextResponse.json(
      { error: "watermark must be tiktok, instagram, or both." },
      { status: 400 },
    );
  }
  const watermarkMode = parseWatermarkMode(form.get("watermark_mode") ?? form.get("mode"));

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const downloaded = await downloadNewsVideoBlob(sourceUrlRaw, token);
  if (downloaded instanceof NextResponse) return downloaded;
  const filename = `video-clean-${Date.now()}.mp4`;

  try {
    const cleaned = await removeWatermarkViaSpojexMediaApi({
      accessToken: token,
      file: downloaded.blob,
      filename,
      preset,
      mode: watermarkMode,
      module: "news",
      folder: folder.includes("video") ? folder : "sport-news/videos",
    });
    if (!cleaned.publicUrl) {
      return NextResponse.json({ error: "Watermark removal failed. No URL returned." }, { status: 400 });
    }
    return NextResponse.json({
      kind: "video",
      path: cleaned.path,
      publicUrl: cleaned.publicUrl,
      objectId: cleaned.objectId,
      durationSeconds: cleaned.durationSeconds ?? null,
      watermarkRemoved: true,
      watermarkPreset: preset,
      watermarkMode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Watermark removal failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * Trim an already-uploaded news video to [start, end) and store the clip.
 */
export async function trimNewsVideoFromForm(
  form: FormData,
  folder: string,
): Promise<NextResponse> {
  const sourceUrlRaw = `${form.get("source_url") ?? form.get("sourceUrl") ?? ""}`.trim();
  if (!sourceUrlRaw) {
    return NextResponse.json({ error: "source_url is required" }, { status: 400 });
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

  const downloaded = await downloadNewsVideoBlob(sourceUrlRaw, token);
  if (downloaded instanceof NextResponse) return downloaded;

  try {
    const trimmed = await trimVideoViaSpojexMediaApi({
      accessToken: token,
      file: downloaded.blob,
      filename: downloaded.filename || `video-trim-${Date.now()}.mp4`,
      startSeconds: Math.max(0, start),
      endSeconds: end,
      module: "news",
      folder: folder.includes("video") ? folder : "sport-news/videos",
    });
    if (!trimmed.publicUrl) {
      return NextResponse.json({ error: "Video trim failed. No URL returned." }, { status: 400 });
    }
    return NextResponse.json({
      kind: "video",
      path: trimmed.path,
      publicUrl: trimmed.publicUrl,
      objectId: trimmed.objectId,
      durationSeconds: trimmed.durationSeconds ?? Math.max(0, Math.round(end - start)),
      trimmed: true,
      startSeconds: start,
      endSeconds: end,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Video trim failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * Shared news media upload: Blob-safe parse, MIME from extension.
 * Images always use server multipart. Video/audio use multipart when small enough;
 * larger files use signed GCS PUT (requires IAM signBlob on the API runtime SA).
 * When kind=audio and the file is video, extracts audio only via the API.
 */
export async function uploadNewsMediaFromForm(
  form: FormData,
  folder: string,
): Promise<NextResponse> {
  const raw = form.get("file");
  const kind = parseNewsUploadKind(`${form.get("kind") ?? ""}`);
  // instanceof File fails across Node/undici realms — accept Blob-like.
  if (!(raw instanceof Blob) || typeof (raw as Blob).arrayBuffer !== "function") {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!kind) {
    return NextResponse.json({ error: "kind must be image, video, or audio." }, { status: 400 });
  }

  const file = raw as Blob & { name?: string };
  const filenameHint =
    (typeof file.name === "string" && file.name.trim()) || `${kind}.bin`;

  // Audio stories / sound library: allow video → extract audio only.
  if (kind === "audio" && isNewsVideoFile(file.type, filenameHint)) {
    const invalidVideo = validateLibrarySound(file.type, filenameHint, file.size);
    if (invalidVideo) {
      return NextResponse.json({ error: invalidVideo }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }
    const token = await requestAccessToken();
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const mime = resolveNewsMime("video", file.type, filenameHint);
    const ext = newsMediaExtension("video", mime, filenameHint);
    const filename = `video-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploadBlob = new Blob([bytes], { type: mime });
    try {
      const uploaded = await extractAudioViaSpojexMediaApi({
        accessToken: token,
        file: uploadBlob,
        filename,
        module: "news",
        folder,
      });
      if (!uploaded.publicUrl) {
        return NextResponse.json({ error: "Upload failed. No URL returned." }, { status: 400 });
      }
      return NextResponse.json({
        kind: "audio",
        path: uploaded.path,
        publicUrl: uploaded.publicUrl,
        objectId: uploaded.objectId,
        durationSeconds: uploaded.durationSeconds ?? null,
        extractedFromVideo: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audio extraction failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const invalid = validateNewsMedia(kind, file.type, filenameHint, file.size);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const mime = resolveNewsMime(kind, file.type, filenameHint);
  const ext = newsMediaExtension(kind, mime, filenameHint);
  const filename = `${kind}-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength <= 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  const uploadBlob = new Blob([bytes], { type: mime });

  const preferMultipart = kind === "image" || uploadBlob.size <= MULTIPART_SAFE_BYTES;

  try {
    let uploaded;
    if (preferMultipart) {
      uploaded = await uploadViaSpojexMediaApi({
        accessToken: token,
        file: uploadBlob,
        filename,
        module: "news",
        folder,
        kind,
      });
    } else {
      try {
        uploaded = await signUploadComplete({
          accessToken: token,
          file: uploadBlob,
          filename,
          module: "news",
          mimeType: mime,
          folder,
        });
      } catch (signErr) {
        const signMsg = signErr instanceof Error ? signErr.message : "Sign failed";
        // If signing is misconfigured, try multipart as a last resort (may hit 32MB CR limit).
        if (uploadBlob.size <= MULTIPART_SAFE_BYTES) {
          uploaded = await uploadViaSpojexMediaApi({
            accessToken: token,
            file: uploadBlob,
            filename,
            module: "news",
            folder,
            kind,
          });
        } else {
          throw new Error(
            `${signMsg} Large video uploads need signed URLs. Ask an admin to grant ` +
              `roles/iam.serviceAccountTokenCreator on the API runtime service account.`,
          );
        }
      }
    }
    if (!uploaded.publicUrl) {
      return NextResponse.json({ error: "Upload failed. No URL returned." }, { status: 400 });
    }
    return NextResponse.json({
      kind,
      path: uploaded.path,
      publicUrl: uploaded.publicUrl,
      objectId: uploaded.objectId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export type { NewsUploadKind };
