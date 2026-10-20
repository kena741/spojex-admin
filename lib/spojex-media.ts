import { getSpojexApiBaseUrl } from "@/lib/env";

/** Media modules accepted by Spojex `/api/v1/media/*`. */
export type SpojexMediaModule =
  | "profiles"
  | "news"
  | "events"
  | "marketplace"
  | "organizations"
  | "stadiums"
  | "gyms"
  | "opportunities"
  | "donations"
  | "miniapps"
  | "banners"
  | "verification"
  | "payments";

export type SpojexMediaUploadResult = {
  objectId?: string;
  path: string;
  publicUrl: string | null;
  url: string | null;
  visibility?: string;
  status?: string;
  durationSeconds?: number | null;
};

function apiErrorMessage(
  payload: { detail?: unknown; error?: string; message?: string },
  fallback: string,
) {
  if (typeof payload.detail === "string" && payload.detail.trim()) return payload.detail;
  if (Array.isArray(payload.detail) && payload.detail[0]?.msg) return String(payload.detail[0].msg);
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (payload.error?.trim()) return payload.error;
  return fallback;
}

/**
 * Server-side upload via deprecated Spojex proxy endpoint.
 * Preferred for admin Next.js routes until browser CORS is applied to GCS.
 */
export async function uploadViaSpojexMediaApi(opts: {
  accessToken: string;
  file: Blob;
  filename: string;
  module: SpojexMediaModule;
  folder?: string;
  kind?: string;
}): Promise<SpojexMediaUploadResult> {
  const base = getSpojexApiBaseUrl();
  if (!base) {
    throw new Error("Spojex API base URL is not configured.");
  }

  const outbound = new FormData();
  outbound.set("module", opts.module);
  if (opts.folder) outbound.set("folder", opts.folder);
  if (opts.kind) outbound.set("kind", opts.kind);
  // Always re-wrap so Node/undici multipart includes filename + content-type.
  const type =
    (opts.file.type && opts.file.type.trim()) || "application/octet-stream";
  const filePart =
    typeof File !== "undefined"
      ? new File([opts.file], opts.filename, { type })
      : opts.file;
  if (filePart instanceof File) {
    outbound.set("file", filePart);
  } else {
    outbound.set("file", filePart, opts.filename);
  }

  const upstream = await fetch(`${base}/api/v1/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body: outbound,
  });
  const text = await upstream.text();
  let payload: {
    error?: string;
    detail?: unknown;
    publicUrl?: string | null;
    url?: string | null;
    path?: string;
    object_path?: string;
    id?: string;
    visibility?: string;
    status?: string;
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    throw new Error(text || "Upload failed");
  }
  if (!upstream.ok) {
    throw new Error(apiErrorMessage(payload, "Upload failed"));
  }

  const publicUrl = payload.publicUrl ?? payload.url ?? null;
  const path = payload.path || payload.object_path || "";
  return {
    objectId: payload.id,
    path,
    publicUrl,
    url: publicUrl,
    visibility: payload.visibility,
    status: payload.status,
  };
}

/**
 * Upload a video; Spojex API extracts audio with ffmpeg and stores only the audio object.
 */
export async function extractAudioViaSpojexMediaApi(opts: {
  accessToken: string;
  file: Blob;
  filename: string;
  module?: SpojexMediaModule;
  folder?: string;
}): Promise<SpojexMediaUploadResult> {
  const base = getSpojexApiBaseUrl();
  if (!base) {
    throw new Error("Spojex API base URL is not configured.");
  }

  const outbound = new FormData();
  outbound.set("module", opts.module ?? "news");
  outbound.set("folder", opts.folder ?? "sport-news/sounds");
  const type = (opts.file.type && opts.file.type.trim()) || "video/mp4";
  const filePart =
    typeof File !== "undefined"
      ? new File([opts.file], opts.filename, { type })
      : opts.file;
  if (filePart instanceof File) {
    outbound.set("file", filePart);
  } else {
    outbound.set("file", filePart, opts.filename);
  }

  const upstream = await fetch(`${base}/api/v1/media/extract-audio`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body: outbound,
  });
  const text = await upstream.text();
  let payload: {
    error?: string;
    detail?: unknown;
    publicUrl?: string | null;
    url?: string | null;
    path?: string;
    object_path?: string;
    objectId?: string;
    id?: string;
    visibility?: string;
    status?: string;
    durationSeconds?: number | null;
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    throw new Error(text || "Audio extraction failed");
  }
  if (!upstream.ok) {
    throw new Error(apiErrorMessage(payload, "Audio extraction failed"));
  }

  const publicUrl = payload.publicUrl ?? payload.url ?? null;
  const path = payload.path || payload.object_path || "";
  return {
    objectId: payload.objectId ?? payload.id,
    path,
    publicUrl,
    url: publicUrl,
    visibility: payload.visibility,
    status: payload.status,
    durationSeconds:
      typeof payload.durationSeconds === "number" ? payload.durationSeconds : null,
  };
}

/**
 * Remove TikTok / Instagram watermark overlays from a video via Spojex ffmpeg.
 */
export async function removeWatermarkViaSpojexMediaApi(opts: {
  accessToken: string;
  file: Blob;
  filename: string;
  /** tiktok | instagram | both */
  preset?: "tiktok" | "instagram" | "both";
  /** delogo | crop_bottom */
  mode?: "delogo" | "crop_bottom";
  module?: SpojexMediaModule;
  folder?: string;
}): Promise<SpojexMediaUploadResult & { watermarkRemoved?: boolean }> {
  const base = getSpojexApiBaseUrl();
  if (!base) {
    throw new Error("Spojex API base URL is not configured.");
  }

  const outbound = new FormData();
  outbound.set("module", opts.module ?? "news");
  outbound.set("folder", opts.folder ?? "sport-news/videos");
  outbound.set("preset", opts.preset ?? "both");
  outbound.set("mode", opts.mode ?? "delogo");
  const type = (opts.file.type && opts.file.type.trim()) || "video/mp4";
  const filePart =
    typeof File !== "undefined"
      ? new File([opts.file], opts.filename, { type })
      : opts.file;
  if (filePart instanceof File) {
    outbound.set("file", filePart);
  } else {
    outbound.set("file", filePart, opts.filename);
  }

  const upstream = await fetch(`${base}/api/v1/media/remove-watermark`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body: outbound,
  });
  const text = await upstream.text();
  let payload: {
    error?: string;
    detail?: unknown;
    publicUrl?: string | null;
    url?: string | null;
    path?: string;
    object_path?: string;
    objectId?: string;
    id?: string;
    visibility?: string;
    status?: string;
    durationSeconds?: number | null;
    watermarkRemoved?: boolean;
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    throw new Error(text || "Watermark removal failed");
  }
  if (!upstream.ok) {
    throw new Error(apiErrorMessage(payload, "Watermark removal failed"));
  }

  const publicUrl = payload.publicUrl ?? payload.url ?? null;
  const path = payload.path || payload.object_path || "";
  return {
    objectId: payload.objectId ?? payload.id,
    path,
    publicUrl,
    url: publicUrl,
    visibility: payload.visibility,
    status: payload.status,
    durationSeconds:
      typeof payload.durationSeconds === "number" ? payload.durationSeconds : null,
    watermarkRemoved: payload.watermarkRemoved !== false,
  };
}

/**
 * Trim a video blob to [startSeconds, endSeconds) via Spojex ffmpeg.
 */
export async function trimVideoViaSpojexMediaApi(opts: {
  accessToken: string;
  file: Blob;
  filename: string;
  startSeconds: number;
  endSeconds: number;
  module?: SpojexMediaModule;
  folder?: string;
}): Promise<SpojexMediaUploadResult> {
  const base = getSpojexApiBaseUrl();
  if (!base) {
    throw new Error("Spojex API base URL is not configured.");
  }
  if (!(opts.endSeconds > opts.startSeconds)) {
    throw new Error("Trim end must be after start.");
  }

  const outbound = new FormData();
  outbound.set("module", opts.module ?? "news");
  outbound.set("folder", opts.folder ?? "sport-news/videos");
  outbound.set("start_seconds", String(Math.max(0, opts.startSeconds)));
  outbound.set("end_seconds", String(opts.endSeconds));
  const type = (opts.file.type && opts.file.type.trim()) || "video/mp4";
  const filePart =
    typeof File !== "undefined"
      ? new File([opts.file], opts.filename, { type })
      : opts.file;
  if (filePart instanceof File) {
    outbound.set("file", filePart);
  } else {
    outbound.set("file", filePart, opts.filename);
  }

  const upstream = await fetch(`${base}/api/v1/media/trim-video`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body: outbound,
  });
  const text = await upstream.text();
  let payload: {
    error?: string;
    detail?: unknown;
    message?: string;
    publicUrl?: string | null;
    url?: string | null;
    path?: string;
    object_path?: string;
    objectId?: string;
    id?: string;
    visibility?: string;
    status?: string;
    durationSeconds?: number | null;
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    throw new Error(text || "Video trim failed");
  }
  if (!upstream.ok) {
    throw new Error(apiErrorMessage(payload, "Video trim failed"));
  }

  const publicUrl = payload.publicUrl ?? payload.url ?? null;
  const path = payload.path || payload.object_path || "";
  return {
    objectId: payload.objectId ?? payload.id,
    path,
    publicUrl,
    url: publicUrl,
    visibility: payload.visibility,
    status: payload.status,
    durationSeconds:
      typeof payload.durationSeconds === "number" ? payload.durationSeconds : null,
  };
}

/**
 * Extract an early video frame as a JPEG cover via Spojex ffmpeg.
 */
export async function extractPosterViaSpojexMediaApi(opts: {
  accessToken: string;
  file: Blob;
  filename: string;
  module?: SpojexMediaModule;
  folder?: string;
  seekSeconds?: number;
}): Promise<SpojexMediaUploadResult> {
  const base = getSpojexApiBaseUrl();
  if (!base) {
    throw new Error("Spojex API base URL is not configured.");
  }

  const outbound = new FormData();
  outbound.set("module", opts.module ?? "news");
  outbound.set("folder", opts.folder ?? "sport-news/covers");
  outbound.set("seek_seconds", String(opts.seekSeconds ?? 0.15));
  const type = (opts.file.type && opts.file.type.trim()) || "video/mp4";
  const filePart =
    typeof File !== "undefined"
      ? new File([opts.file], opts.filename, { type })
      : opts.file;
  if (filePart instanceof File) {
    outbound.set("file", filePart);
  } else {
    outbound.set("file", filePart, opts.filename);
  }

  const upstream = await fetch(`${base}/api/v1/media/extract-poster`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body: outbound,
  });
  const text = await upstream.text();
  let payload: {
    error?: string;
    detail?: unknown;
    message?: string;
    publicUrl?: string | null;
    url?: string | null;
    path?: string;
    object_path?: string;
    objectId?: string;
    id?: string;
    visibility?: string;
    status?: string;
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    throw new Error(text || "Poster extract failed");
  }
  if (!upstream.ok) {
    throw new Error(apiErrorMessage(payload, "Poster extract failed"));
  }

  const publicUrl = payload.publicUrl ?? payload.url ?? null;
  const path = payload.path || payload.object_path || "";
  return {
    objectId: payload.objectId ?? payload.id,
    path,
    publicUrl,
    url: publicUrl,
    visibility: payload.visibility,
    status: payload.status,
  };
}

/**
 * Trim an audio blob to [startSeconds, endSeconds) via Spojex ffmpeg.
 */
export async function trimAudioViaSpojexMediaApi(opts: {
  accessToken: string;
  file: Blob;
  filename: string;
  startSeconds: number;
  endSeconds: number;
  module?: SpojexMediaModule;
  folder?: string;
}): Promise<SpojexMediaUploadResult> {
  const base = getSpojexApiBaseUrl();
  if (!base) {
    throw new Error("Spojex API base URL is not configured.");
  }
  if (!(opts.endSeconds > opts.startSeconds)) {
    throw new Error("Trim end must be after start.");
  }

  const outbound = new FormData();
  outbound.set("module", opts.module ?? "news");
  outbound.set("folder", opts.folder ?? "sport-news/sounds");
  outbound.set("start_seconds", String(Math.max(0, opts.startSeconds)));
  outbound.set("end_seconds", String(opts.endSeconds));
  const type = (opts.file.type && opts.file.type.trim()) || "audio/mp4";
  const filePart =
    typeof File !== "undefined"
      ? new File([opts.file], opts.filename, { type })
      : opts.file;
  if (filePart instanceof File) {
    outbound.set("file", filePart);
  } else {
    outbound.set("file", filePart, opts.filename);
  }

  const upstream = await fetch(`${base}/api/v1/media/trim-audio`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body: outbound,
  });
  const text = await upstream.text();
  let payload: {
    error?: string;
    detail?: unknown;
    publicUrl?: string | null;
    url?: string | null;
    path?: string;
    object_path?: string;
    objectId?: string;
    id?: string;
    visibility?: string;
    status?: string;
    durationSeconds?: number | null;
  } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    throw new Error(text || "Audio trim failed");
  }
  if (!upstream.ok) {
    throw new Error(apiErrorMessage(payload, "Audio trim failed"));
  }

  const publicUrl = payload.publicUrl ?? payload.url ?? null;
  const path = payload.path || payload.object_path || "";
  return {
    objectId: payload.objectId ?? payload.id,
    path,
    publicUrl,
    url: publicUrl,
    visibility: payload.visibility,
    status: payload.status,
    durationSeconds:
      typeof payload.durationSeconds === "number" ? payload.durationSeconds : null,
  };
}

type SignResponse = {
  objectId: string;
  uploadUrl: string;
  requiredHeaders?: Record<string, string>;
  object_path?: string;
  path?: string;
};

/**
 * Browser-oriented signed PUT flow (needs GCS CORS on the target bucket).
 * 1) POST /media/uploads/sign → 2) PUT bytes to GCS → 3) POST /media/uploads/{id}/complete
 */
export async function signUploadComplete(opts: {
  accessToken: string;
  file: Blob;
  filename: string;
  module: SpojexMediaModule;
  mimeType: string;
  folder?: string;
}): Promise<SpojexMediaUploadResult> {
  const base = getSpojexApiBaseUrl();
  if (!base) {
    throw new Error("Spojex API base URL is not configured.");
  }
  const headers = {
    Authorization: `Bearer ${opts.accessToken}`,
    "Content-Type": "application/json",
  };

  const signRes = await fetch(`${base}/api/v1/media/uploads/sign`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      module: opts.module,
      mime_type: opts.mimeType,
      byte_size: opts.file.size,
      filename: opts.filename,
      folder: opts.folder ?? null,
    }),
  });
  const signText = await signRes.text();
  let signed: SignResponse & { detail?: unknown; error?: string } = {
    objectId: "",
    uploadUrl: "",
  };
  try {
    signed = signText ? (JSON.parse(signText) as typeof signed) : signed;
  } catch {
    throw new Error(signText || "Failed to sign upload");
  }
  if (!signRes.ok) {
    throw new Error(apiErrorMessage(signed, "Failed to sign upload"));
  }
  if (!signed.uploadUrl || !signed.objectId) {
    throw new Error("Sign response missing uploadUrl or objectId");
  }

  const putHeaders = new Headers(signed.requiredHeaders ?? {});
  if (!putHeaders.has("Content-Type")) {
    putHeaders.set("Content-Type", opts.mimeType);
  }
  const putRes = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: putHeaders,
    body: opts.file,
  });
  if (!putRes.ok) {
    throw new Error(`GCS upload failed (${putRes.status})`);
  }

  const completeRes = await fetch(`${base}/api/v1/media/uploads/${signed.objectId}/complete`, {
    method: "POST",
    headers,
  });
  const completeText = await completeRes.text();
  let completed: {
    detail?: unknown;
    error?: string;
    object?: SpojexMediaUploadResult & { id?: string; object_path?: string };
    publicUrl?: string | null;
    url?: string | null;
    path?: string;
    objectId?: string;
    id?: string;
    object_path?: string;
    visibility?: string;
    status?: string;
  } = {};
  try {
    completed = completeText ? (JSON.parse(completeText) as typeof completed) : {};
  } catch {
    throw new Error(completeText || "Failed to complete upload");
  }
  if (!completeRes.ok) {
    throw new Error(apiErrorMessage(completed, "Failed to complete upload"));
  }

  const obj = completed.object;
  const publicUrl = obj?.publicUrl ?? obj?.url ?? completed.publicUrl ?? completed.url ?? null;
  return {
    objectId: completed.objectId || obj?.objectId || obj?.id || completed.id || signed.objectId,
    path:
      obj?.path ||
      obj?.object_path ||
      completed.path ||
      completed.object_path ||
      signed.path ||
      signed.object_path ||
      "",
    publicUrl,
    url: publicUrl,
    visibility: obj?.visibility ?? completed.visibility,
    status: obj?.status ?? completed.status,
  };
}

export function imageExtension(type: string, filename: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/jpeg") return "jpg";
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "jpg";
}

/**
 * Rewrite direct GCS URLs to the Spojex API media proxy so browsers never hit
 * storage.googleapis.com (403 without public IAM; also enables API rate limits).
 */
export function toBackendMediaUrl(url: string | null | undefined): string {
  const raw = `${url ?? ""}`.trim();
  if (!raw) return "";
  const base = getSpojexApiBaseUrl();

  const gcs = raw.match(/^https:\/\/storage\.googleapis\.com\/[^/]+\/(.+)$/i);
  if (gcs?.[1]) {
    return `${base}/api/v1/media/file/${gcs[1].split("#")[0].split("?")[0]}`;
  }

  if (raw.startsWith("/api/v1/media/")) {
    return `${base}${raw}`;
  }

  if (raw.startsWith("api/v1/media/")) {
    return `${base}/${raw}`;
  }

  // Already an absolute Spojex media URL, or external https link.
  return raw;
}
