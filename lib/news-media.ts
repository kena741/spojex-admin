export type NewsStoryMedia = "none" | "video" | "audio";
export type NewsUploadKind = "image" | "video" | "audio";

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

export const newsImageAccept = "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";
export const newsVideoAccept = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v";
export const newsAudioAccept = "audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg";
/** Sound library: audio files, or video (API extracts audio only). */
export const newsLibrarySoundAccept = `${newsAudioAccept},${newsVideoAccept}`;

/** Multipart proxy to Cloud Run stays under ~32MB. */
const LIBRARY_VIDEO_MAX = 28 * 1024 * 1024;

export function isNewsVideoFile(type: string, filename: string) {
  const declared = (type || "").trim().toLowerCase();
  return VIDEO_TYPES.has(declared) || /\.(mp4|webm|mov|m4v)$/i.test(filename);
}

export function validateLibrarySound(type: string, filename: string, size: number) {
  if (isNewsVideoFile(type, filename)) {
    if (!VIDEO_TYPES.has(type) && !/\.(mp4|webm|mov|m4v)$/i.test(filename)) {
      return "Use an MP4, WebM, or MOV video.";
    }
    if (size > LIBRARY_VIDEO_MAX) {
      return "Video must be 28 MB or smaller so audio can be extracted.";
    }
    return null;
  }
  return validateNewsMedia("audio", type, filename, size);
}

export function parseNewsUploadKind(value: string): NewsUploadKind | null {
  const kind = value.trim().toLowerCase();
  if (kind === "video" || kind === "audio") return kind;
  if (kind === "image" || kind === "thumbnail" || kind === "cover") return "image";
  return null;
}

export function resolveNewsStoryMedia(
  videoUrl: string,
  audioUrl: string,
  picked: NewsStoryMedia | null,
  options?: { imageUrl?: string; soundId?: string | null },
): NewsStoryMedia {
  if (videoUrl.trim()) return "video";
  const hasImage = Boolean(options?.imageUrl?.trim());
  const hasLibrarySound = Boolean(options?.soundId?.trim());
  // Image + library/soundtrack audio stays in text/image mode (picker stays visible).
  if (hasImage && (hasLibrarySound || picked === "none")) {
    return picked === "audio" ? "audio" : "none";
  }
  if (hasImage && audioUrl.trim() && picked !== "audio") {
    return "none";
  }
  if (picked === "audio") return "audio";
  if (audioUrl.trim() && !hasImage) return "audio";
  if (audioUrl.trim() && picked == null) return "audio";
  if (audioUrl.trim()) return "audio";
  return picked ?? "none";
}

export function newsMediaExtension(kind: NewsUploadKind, type: string, filename: string) {
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
    if (type === "video/x-m4v") return "m4v";
    return "mp4";
  }
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

/**
 * Browsers (esp. Safari) often send an empty Content-Type for video/audio.
 * Resolve a MIME the Spojex media API will accept from declared type + extension.
 */
export function resolveNewsMime(kind: NewsUploadKind, type: string, filename: string): string {
  const declared = (type || "").trim().toLowerCase();
  if (kind === "video") {
    if (VIDEO_TYPES.has(declared)) return declared;
    if (/\.webm$/i.test(filename)) return "video/webm";
    if (/\.mov$/i.test(filename)) return "video/quicktime";
    if (/\.m4v$/i.test(filename)) return "video/x-m4v";
    return "video/mp4";
  }
  if (kind === "audio") {
    if (AUDIO_TYPES.has(declared)) return declared === "audio/mp3" ? "audio/mpeg" : declared;
    if (/\.wav$/i.test(filename)) return "audio/wav";
    if (/\.ogg$/i.test(filename)) return "audio/ogg";
    if (/\.(m4a|aac)$/i.test(filename)) return "audio/mp4";
    return "audio/mpeg";
  }
  if (IMAGE_TYPES.has(declared)) return declared;
  if (/\.png$/i.test(filename)) return "image/png";
  if (/\.webp$/i.test(filename)) return "image/webp";
  if (/\.gif$/i.test(filename)) return "image/gif";
  return "image/jpeg";
}

export function validateNewsMedia(kind: NewsUploadKind, type: string, filename: string, size: number) {
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

/**
 * Grab an early frame from a local video file as a JPEG cover.
 * Used when admin uploads Sport news video without a separate cover image
 * so the feed doesn't fall back to the soccer-ball placeholder.
 */
export async function captureVideoCoverFile(
  source: File,
  opts?: { seekSeconds?: number },
): Promise<File> {
  if (typeof document === "undefined") {
    throw new Error("Cover capture requires a browser.");
  }
  const objectUrl = URL.createObjectURL(source);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "true");

    await new Promise<void>((resolve, reject) => {
      const onReady = () => resolve();
      const onError = () => reject(new Error("Could not read video for cover."));
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.src = objectUrl;
      video.load();
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const preferred = opts?.seekSeconds ?? 0.25;
    const seekTo =
      duration > 0
        ? Math.min(Math.max(preferred, 0.05), Math.max(duration * 0.05, 0.05))
        : preferred;

    if (seekTo > 0) {
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => resolve();
        const onError = () => reject(new Error("Could not seek video for cover."));
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        try {
          video.currentTime = seekTo;
        } catch {
          resolve();
        }
      });
    }

    const width = video.videoWidth || 720;
    const height = video.videoHeight || 1280;
    if (width < 2 || height < 2) {
      throw new Error("Video has no visible frame for cover.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not capture cover frame.");
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Could not encode cover image.")),
        "image/jpeg",
        0.88,
      );
    });

    return new File([blob], `news-cover-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
