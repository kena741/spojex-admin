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

async function readJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error("Upload failed. Try a smaller file or refresh the page.");
  }
  try {
    return JSON.parse(text) as {
      error?: string;
      path?: string;
      publicUrl?: string;
      extractedFromVideo?: boolean;
    };
  } catch {
    throw new Error("Upload failed. Unexpected server response.");
  }
}

/** Upload news media via Spojex API (GCS behind the API), return display URL. */
export async function uploadNewsFile(articleId: string | null, file: File, kind: NewsUploadKind) {
  const invalid =
    kind === "audio" && isNewsVideoFile(file.type, file.name)
      ? validateLibrarySound(file.type, file.name, file.size)
      : validateNewsMedia(kind, file.type, file.name, file.size);
  if (invalid) throw new Error(invalid);

  const endpoint = articleId ? `/api/admin/news/${articleId}/media` : "/api/admin/news/media";
  const body = new FormData();
  body.set("kind", kind);
  body.set("file", file, file.name);

  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || "Upload failed");
  if (!payload.publicUrl) throw new Error("Upload failed. No public URL was returned.");
  return toBackendMediaUrl(payload.publicUrl);
}

export function NewsMediaPreview({
  imageUrl,
  videoUrl,
  audioUrl,
  mediaKind,
}: {
  imageUrl: string;
  videoUrl: string;
  audioUrl: string;
  mediaKind: NewsStoryMedia;
}) {
  const image = toBackendMediaUrl(imageUrl);
  const video = toBackendMediaUrl(videoUrl);
  const audio = toBackendMediaUrl(audioUrl);

  return (
    <>
      {mediaKind === "video" && video ? (
        <video
          src={video}
          controls
          poster={image || undefined}
          className="mb-4 h-48 w-full rounded-lg bg-black object-contain"
        />
      ) : image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="mb-4 h-48 w-full rounded-lg object-cover" />
      ) : null}
      {mediaKind === "audio" && audio ? <audio src={audio} controls className="mb-4 w-full" /> : null}
    </>
  );
}

export function NewsMediaFields({
  imageUrl,
  videoUrl,
  audioUrl,
  soundId = "",
  pickedKind,
  uploading,
  disabled,
  onKind,
  onUpload,
  onRemoveImage,
  onRemoveVideo,
  onRemoveAudio,
  onSoundSelect,
}: {
  imageUrl: string;
  videoUrl: string;
  audioUrl: string;
  soundId?: string;
  pickedKind: NewsStoryMedia | null;
  uploading: NewsUploadKind | null;
  disabled?: boolean;
  onKind: (kind: NewsStoryMedia) => void;
  onUpload: (file: File, kind: NewsUploadKind) => void;
  onRemoveImage: () => void;
  onRemoveVideo: () => void;
  onRemoveAudio: () => void;
  onSoundSelect?: (sound: SportNewsSoundRow | null) => void;
}) {
  const hasImage = Boolean(imageUrl.trim());
  const hasVideo = Boolean(videoUrl.trim());
  const hasLibrarySound = Boolean(soundId.trim());
  const hasDedicatedAudio = Boolean(audioUrl.trim()) && !hasLibrarySound;
  const mediaKind = resolveNewsStoryMedia(videoUrl, audioUrl, pickedKind, {
    imageUrl,
    soundId,
  });
  const busy = Boolean(uploading) || Boolean(disabled);
  const imagePreview = toBackendMediaUrl(imageUrl);
  const showSoundPicker =
    Boolean(onSoundSelect) && mediaKind === "none" && hasImage && !hasVideo;
  const [dragOver, setDragOver] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const imageZoneRef = useRef<HTMLDivElement>(null);

  const acceptImageFile = useCallback(
    (file: File | null) => {
      if (!file || busy) return;
      const invalid = validateNewsMedia("image", file.type, file.name, file.size);
      if (invalid) {
        setPasteHint(invalid);
        return;
      }
      setPasteHint(null);
      onUpload(file, "image");
    },
    [busy, onUpload],
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
        <label className="text-xs font-medium text-text-secondary">Image</label>
        {hasImage ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRemoveImage}
            className="text-xs font-medium text-red-600 hover:underline"
          >
            Delete image
          </button>
        ) : null}
      </div>
      <div
        ref={imageZoneRef}
        tabIndex={0}
        role="button"
        aria-label="Paste or drop news image"
        onPaste={onImagePaste}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = clipboardImageFile(event.dataTransfer);
          acceptImageFile(file);
        }}
        className={`mb-2 overflow-hidden rounded-lg border border-dashed outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          dragOver
            ? "border-primary bg-primary/10"
            : "border-border bg-muted/40"
        }`}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagePreview}
            alt=""
            className="h-36 w-full object-cover"
          />
        ) : (
          <div className="flex h-28 flex-col items-center justify-center gap-1 px-3 text-center text-xs text-text-secondary">
            <span>{dragOver ? "Drop image to upload" : "Paste (⌘V / Ctrl+V) or drop an image"}</span>
            <span className="text-[11px] text-text-hint">JPG, PNG, WebP, or GIF · max 5 MB</span>
          </div>
        )}
      </div>
      {pasteHint ? <p className="mb-2 text-xs text-red-600">{pasteHint}</p> : null}
      <input
        type="file"
        accept={newsImageAccept}
        disabled={busy}
        className={fileInputClass}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) acceptImageFile(file);
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
          <input
            type="file"
            accept={newsVideoAccept}
            disabled={busy}
            className={fileInputClass}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file, "video");
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

      {uploading ? (
        <p className="mt-2 text-xs text-text-secondary">Uploading {uploading}…</p>
      ) : null}
    </div>
  );
}
