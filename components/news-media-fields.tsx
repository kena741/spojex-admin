"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NewsSoundPicker } from "@/components/news-sound-picker";
import {
  isNewsVideoFile,
  newsImageAccept,
  newsLibrarySoundAccept,
  newsVideoAccept,
  resolveNewsStoryMedia,
  validateLibrarySound,
  validateNewsMedia,
  type NewsStoryMedia,
  type NewsUploadKind,
} from "@/lib/news-media";
import type { SportNewsSoundRow } from "@/lib/news-sounds";
import { toBackendMediaUrl } from "@/lib/spojex-media";

const fileInputClass =
  "block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground";

const IMAGE_MIME = /^image\/(jpeg|png|webp|gif)$/i;

function clipboardImageFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  const items = data.items ? Array.from(data.items) : [];
  for (const item of items) {
    if (item.kind === "file" && IMAGE_MIME.test(item.type)) {
      const file = item.getAsFile();
      if (file) {
        const ext = item.type.includes("png")
          ? "png"
          : item.type.includes("webp")
            ? "webp"
            : item.type.includes("gif")
              ? "gif"
              : "jpg";
        const name = file.name?.trim() || `pasted-image.${ext}`;
        return name === file.name ? file : new File([file], name, { type: file.type || item.type });
      }
    }
  }
  const files = data.files ? Array.from(data.files) : [];
  for (const file of files) {
    if (IMAGE_MIME.test(file.type) || /\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
      return file;
    }
  }
  return null;
}

type NewsUploadPayload = {
  error?: string;
  path?: string;
  publicUrl?: string;
  extractedFromVideo?: boolean;
};

export type NewsUploadOptions = {
  onProgress?: (percent: number) => void;
  /** Remove TikTok / Instagram watermark while uploading video. */
  watermark?: "none" | "tiktok" | "instagram" | "both";
  watermarkMode?: "delogo" | "crop_bottom";
};

function parseUploadPayload(text: string): NewsUploadPayload {
  if (!text.trim()) {
    throw new Error("Upload failed. Try a smaller file or refresh the page.");
  }
  try {
    return JSON.parse(text) as NewsUploadPayload;
  } catch {
    throw new Error("Upload failed. Unexpected server response.");
  }
}

/** Upload news media via Spojex API (GCS behind the API), return display URL. */
export async function uploadNewsFile(
  articleId: string | null,
  file: File,
  kind: NewsUploadKind,
  options?: NewsUploadOptions,
) {
  const invalid =
    kind === "audio" && isNewsVideoFile(file.type, file.name)
      ? validateLibrarySound(file.type, file.name, file.size)
      : validateNewsMedia(kind, file.type, file.name, file.size);
  if (invalid) throw new Error(invalid);

  const endpoint = articleId ? `/api/admin/news/${articleId}/media` : "/api/admin/news/media";
  const body = new FormData();
  body.set("kind", kind);
  body.set("file", file, file.name);
  if (kind === "video" && options?.watermark && options.watermark !== "none") {
    body.set("watermark", options.watermark);
    body.set("watermark_mode", options.watermarkMode ?? "delogo");
  }

  const onProgress = options?.onProgress;
  // XHR so we can show circular progress while pasting / uploading images.
  if (onProgress) {
    onProgress(0);
    const payload = await new Promise<NewsUploadPayload>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
        onProgress(pct);
      };
      xhr.onload = () => {
        try {
          const parsed = parseUploadPayload(xhr.responseText || "");
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(parsed.error || "Upload failed"));
            return;
          }
          onProgress(100);
          resolve(parsed);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Upload failed"));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
      xhr.onabort = () => reject(new Error("Upload cancelled."));
      xhr.send(body);
    });
    if (!payload.publicUrl) throw new Error("Upload failed. No public URL was returned.");
    return toBackendMediaUrl(payload.publicUrl);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  const payload = parseUploadPayload(await response.text());
  if (!response.ok) throw new Error(payload.error || "Upload failed");
  if (!payload.publicUrl) throw new Error("Upload failed. No public URL was returned.");
  return toBackendMediaUrl(payload.publicUrl);
}

function UploadCircleProgress({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 22;
  const stroke = 3.5;
  const c = 2 * Math.PI * radius;
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 56 56" aria-hidden>
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={stroke}
        />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke="white"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-150 ease-out"
        />
      </svg>
      <span className="absolute text-xs font-semibold text-white tabular-nums">
        {clamped}%
      </span>
    </div>
  );
}

export { NewsMediaPreview, NewsTikTokPreview } from "@/components/news-tiktok-preview";

const MAX_NEWS_IMAGES = 10;

export function NewsMediaFields({
  imageUrl,
  imageUrls,
  videoUrl,
  audioUrl,
  soundId = "",
  pickedKind,
  uploading,
  disabled,
  onKind,
  onUpload,
  onRemoveImage,
  onRemoveImageAt,
  onRemoveVideo,
  onRemoveAudio,
  onSoundSelect,
}: {
  imageUrl: string;
  /** Ordered gallery (preferred). Falls back to [imageUrl] when empty. */
  imageUrls?: string[];
  videoUrl: string;
  audioUrl: string;
  soundId?: string;
  pickedKind: NewsStoryMedia | null;
  uploading: NewsUploadKind | null;
  disabled?: boolean;
  onKind: (kind: NewsStoryMedia) => void;
  onUpload: (
    file: File,
    kind: NewsUploadKind,
    options?: NewsUploadOptions,
  ) => void | Promise<void>;
  onRemoveImage: () => void;
  onRemoveImageAt?: (index: number) => void;
  onRemoveVideo: () => void;
  onRemoveAudio: () => void;
  onSoundSelect?: (sound: SportNewsSoundRow | null) => void;
}) {
  const [watermark, setWatermark] = useState<"none" | "tiktok" | "instagram" | "both">("both");
  const [watermarkMode, setWatermarkMode] = useState<"delogo" | "crop_bottom">("delogo");

  const gallery = (
    imageUrls && imageUrls.length > 0
      ? imageUrls
      : imageUrl.trim()
        ? [imageUrl.trim()]
        : []
  )
    .map((url) => url.trim())
    .filter(Boolean);
  const hasImage = gallery.length > 0;
  const canAddMoreImages = gallery.length < MAX_NEWS_IMAGES;
  const hasVideo = Boolean(videoUrl.trim());
  const hasLibrarySound = Boolean(soundId.trim());
  const hasDedicatedAudio = Boolean(audioUrl.trim()) && !hasLibrarySound;
  const mediaKind = resolveNewsStoryMedia(videoUrl, audioUrl, pickedKind, {
    imageUrl: gallery[0] ?? imageUrl,
    soundId,
  });
  const busy = Boolean(uploading) || Boolean(disabled);
  const imagePreview = toBackendMediaUrl(gallery[0] ?? "");
  const showSoundPicker =
    Boolean(onSoundSelect) && mediaKind === "none" && hasImage && !hasVideo;
  const [dragOver, setDragOver] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [stagingPreview, setStagingPreview] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const imageZoneRef = useRef<HTMLDivElement>(null);
  const stagingUrlRef = useRef<string | null>(null);

  const clearStagingPreview = useCallback(() => {
    if (stagingUrlRef.current) {
      URL.revokeObjectURL(stagingUrlRef.current);
      stagingUrlRef.current = null;
    }
    setStagingPreview(null);
    setUploadPercent(0);
  }, []);

  useEffect(() => {
    if (uploading !== "image") clearStagingPreview();
  }, [clearStagingPreview, uploading]);

  useEffect(() => () => clearStagingPreview(), [clearStagingPreview]);

  const acceptImageFile = useCallback(
    (file: File | null) => {
      if (!file || busy) return;
      if (!canAddMoreImages) {
        setPasteHint(`You can add up to ${MAX_NEWS_IMAGES} images.`);
        return;
      }
      const invalid = validateNewsMedia("image", file.type, file.name, file.size);
      if (invalid) {
        setPasteHint(invalid);
        return;
      }
      setPasteHint(null);
      if (stagingUrlRef.current) URL.revokeObjectURL(stagingUrlRef.current);
      const previewUrl = URL.createObjectURL(file);
      stagingUrlRef.current = previewUrl;
      setStagingPreview(previewUrl);
      setUploadPercent(0);
      void Promise.resolve(
        onUpload(file, "image", {
          onProgress: (percent) => setUploadPercent(percent),
        }),
      ).catch(() => {
        clearStagingPreview();
      });
    },
    [busy, canAddMoreImages, clearStagingPreview, onUpload],
  );

  const onImagePaste = useCallback(
    (event: React.ClipboardEvent | ClipboardEvent) => {
      if (busy) return;
      const file = clipboardImageFile(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      acceptImageFile(file);
    },
    [acceptImageFile, busy],
  );

  // Paste works even when focus is in a nearby title/body field on the news form.
  useEffect(() => {
    if (busy) return;
    const onWindowPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Don't steal paste from text inputs/textareas (except our image zone).
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable) &&
        !imageZoneRef.current?.contains(target)
      ) {
        return;
      }
      const file = clipboardImageFile(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      acceptImageFile(file);
    };
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [acceptImageFile, busy]);

  const chooseKind = (kind: NewsStoryMedia) => {
    if (hasVideo && kind !== "video") return;
    if (hasDedicatedAudio && kind !== "audio") return;
    if (hasLibrarySound && kind === "audio") {
      onSoundSelect?.(null);
    }
    if (hasLibrarySound && kind === "video") {
      onSoundSelect?.(null);
    }
    onKind(kind);
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-sm font-medium">Media</p>
      <p className="mb-3 text-xs text-text-secondary">
        Text/image, video, or audio story. Paste or drop an image, or choose a file. Image posts can pick a library soundtrack.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            [
              "none",
              "Text / image",
              hasVideo || hasDedicatedAudio,
              hasVideo ? "Remove the video first" : hasDedicatedAudio ? "Remove the audio first" : "",
            ],
            ["video", "Video", hasDedicatedAudio || hasLibrarySound, "Remove the audio/sound first"],
            ["audio", "Audio", hasVideo || hasLibrarySound, hasLibrarySound ? "Clear the image soundtrack first" : "Remove the video first"],
          ] as const
        ).map(([id, label, locked, reason]) => (
          <button
            key={id}
            type="button"
            disabled={locked || busy}
            title={locked ? reason : undefined}
            onClick={() => chooseKind(id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mediaKind === id
                ? "bg-primary text-primary-foreground"
                : locked
                  ? "cursor-not-allowed border border-border bg-muted text-text-hint"
                  : "border border-border bg-card hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-text-secondary">
          Images {hasImage ? `(${gallery.length}/${MAX_NEWS_IMAGES})` : ""}
        </label>
        {hasImage ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRemoveImage}
            className="text-xs font-medium text-red-600 hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>
      {hasImage ? (
        <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {gallery.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="relative overflow-hidden rounded-lg border border-border bg-muted/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={toBackendMediaUrl(url)}
                alt=""
                className="h-24 w-full object-cover"
              />
              {onRemoveImageAt ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemoveImageAt(index)}
                  className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white"
                >
                  Remove
                </button>
              ) : null}
              {index === 0 ? (
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Cover
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div
        ref={imageZoneRef}
        tabIndex={0}
        role="button"
        aria-label="Paste or drop news images"
        onPaste={onImagePaste}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!busy && canAddMoreImages) setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy && canAddMoreImages) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const files = event.dataTransfer?.files
            ? Array.from(event.dataTransfer.files)
            : [];
          if (files.length > 1) {
            for (const file of files.slice(0, MAX_NEWS_IMAGES - gallery.length)) {
              acceptImageFile(file);
            }
            return;
          }
          const file = clipboardImageFile(event.dataTransfer);
          acceptImageFile(file);
        }}
        className={`relative mb-2 overflow-hidden rounded-lg border border-dashed outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          dragOver
            ? "border-primary bg-primary/10"
            : "border-border bg-muted/40"
        }`}
      >
        {stagingPreview ? (
          <div className="relative h-40 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stagingPreview}
              alt=""
              className="h-full w-full object-cover blur-md scale-105"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45">
              <UploadCircleProgress percent={uploadPercent} />
              <span className="text-xs font-medium text-white/90">
                {uploadPercent >= 100 ? "Saving…" : "Uploading…"}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex h-28 flex-col items-center justify-center gap-1 px-3 text-center text-xs text-text-secondary">
            <span>
              {dragOver
                ? "Drop images to upload"
                : canAddMoreImages
                  ? "Paste (⌘V / Ctrl+V) or drop images"
                  : `Maximum ${MAX_NEWS_IMAGES} images`}
            </span>
            <span className="text-[11px] text-text-hint">
              JPG, PNG, WebP, or GIF · max 5 MB each · swipe gallery in the app
            </span>
          </div>
        )}
      </div>
      {pasteHint ? <p className="mb-2 text-xs text-red-600">{pasteHint}</p> : null}
      <input
        type="file"
        accept={newsImageAccept}
        multiple
        disabled={busy || !canAddMoreImages}
        className={fileInputClass}
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = "";
          for (const file of files.slice(0, MAX_NEWS_IMAGES - gallery.length)) {
            acceptImageFile(file);
          }
        }}
      />

      {mediaKind === "video" ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-text-secondary">Video</label>
            {hasVideo ? (
              <button
                type="button"
                disabled={busy}
                onClick={onRemoveVideo}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Delete video
              </button>
            ) : null}
          </div>
          {hasVideo ? (
            <video
              src={toBackendMediaUrl(videoUrl)}
              controls
              poster={imagePreview || undefined}
              className="mb-2 h-36 w-full rounded-lg bg-black object-contain"
            />
          ) : (
            <div className="mb-2 flex h-28 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-xs text-text-secondary">
              No video uploaded
            </div>
          )}
          {!hasVideo ? (
            <div className="mb-3 grid gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs">
                <span className="font-medium text-text-secondary">Remove watermark</span>
                <select
                  value={watermark}
                  disabled={busy}
                  onChange={(e) =>
                    setWatermark(e.target.value as typeof watermark)
                  }
                  className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                >
                  <option value="none">Keep as uploaded</option>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="both">TikTok + Instagram</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                <span className="font-medium text-text-secondary">Method</span>
                <select
                  value={watermarkMode}
                  disabled={busy || watermark === "none"}
                  onChange={(e) =>
                    setWatermarkMode(e.target.value as typeof watermarkMode)
                  }
                  className="h-9 rounded-md border border-border bg-card px-2 text-sm disabled:opacity-50"
                >
                  <option value="delogo">Inpaint corners (keep full frame)</option>
                  <option value="crop_bottom">Crop bottom band (stronger)</option>
                </select>
              </label>
              <p className="text-[11px] text-text-hint sm:col-span-2">
                Works best on static corner marks. Moving watermarks may remain. Max 28 MB when
                removing a watermark.
              </p>
            </div>
          ) : null}
          <input
            type="file"
            accept={newsVideoAccept}
            disabled={busy}
            className={fileInputClass}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void onUpload(file, "video", {
                watermark,
                watermarkMode,
              });
            }}
          />
        </div>
      ) : null}

      {mediaKind === "audio" ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-text-secondary">Audio or video</label>
            {hasDedicatedAudio ? (
              <button
                type="button"
                disabled={busy}
                onClick={onRemoveAudio}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Delete audio
              </button>
            ) : null}
          </div>
          {hasDedicatedAudio ? (
            <audio
              src={toBackendMediaUrl(audioUrl)}
              controls
              className="mb-2 w-full"
            />
          ) : (
            <div className="mb-2 flex h-16 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-xs text-text-secondary">
              No audio uploaded — MP3/M4A or video (audio track only)
            </div>
          )}
          <input
            type="file"
            accept={newsLibrarySoundAccept}
            disabled={busy}
            className={fileInputClass}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file, "audio");
            }}
          />
        </div>
      ) : null}

      {showSoundPicker ? (
        <NewsSoundPicker
          soundId={soundId}
          audioUrl={audioUrl}
          disabled={busy}
          onSelect={(sound) => onSoundSelect?.(sound)}
        />
      ) : null}

      {uploading && uploading !== "image" ? (
        <p className="mt-2 text-xs text-text-secondary">Uploading {uploading}…</p>
      ) : null}
    </div>
  );
}
