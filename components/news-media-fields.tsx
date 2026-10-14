"use client";

import { useEffect, useState } from "react";
import {
  newsAudioAccept,
  newsImageAccept,
  newsVideoAccept,
  resolveNewsStoryMedia,
  validateNewsMedia,
  type NewsStoryMedia,
  type NewsUploadKind,
} from "@/lib/news-media";
import { toBackendMediaUrl } from "@/lib/spojex-media";

const fileInputClass =
  "block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground";

async function readJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error("Upload failed. Try a smaller file or refresh the page.");
  }
  try {
    return JSON.parse(text) as { error?: string; path?: string; publicUrl?: string };
  } catch {
    throw new Error("Upload failed. Unexpected server response.");
  }
}

/** Upload news media via Spojex API (GCS behind the API), return display URL. */
export async function uploadNewsFile(articleId: string | null, file: File, kind: NewsUploadKind) {
  const invalid = validateNewsMedia(kind, file.type, file.name, file.size);
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

function UrlField({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <input
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text.trim() !== value.trim()) onCommit(text.trim());
      }}
      placeholder={placeholder}
      className="h-10 w-full rounded-lg border border-border px-3"
    />
  );
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
  pickedKind,
  uploading,
  disabled,
  onKind,
  onUpload,
  onImageUrl,
  onVideoUrl,
  onAudioUrl,
  onRemoveVideo,
  onRemoveAudio,
}: {
  imageUrl: string;
  videoUrl: string;
  audioUrl: string;
  pickedKind: NewsStoryMedia | null;
  uploading: NewsUploadKind | null;
  disabled?: boolean;
  onKind: (kind: NewsStoryMedia) => void;
  onUpload: (file: File, kind: NewsUploadKind) => void;
  onImageUrl: (url: string) => void;
  onVideoUrl: (url: string) => void;
  onAudioUrl: (url: string) => void;
  onRemoveVideo: () => void;
  onRemoveAudio: () => void;
}) {
  const hasVideo = Boolean(videoUrl.trim());
  const hasAudio = Boolean(audioUrl.trim());
  const mediaKind = resolveNewsStoryMedia(videoUrl, audioUrl, pickedKind);
  const busy = Boolean(uploading) || Boolean(disabled);

  const chooseKind = (kind: NewsStoryMedia) => {
    if (hasVideo && kind !== "video") return;
    if (hasAudio && kind !== "audio") return;
    onKind(kind);
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-sm font-medium">Media</p>
      <p className="mb-3 text-xs text-text-secondary">
        Files upload through the Spojex API (stored in Cloud Storage). The returned URL is saved on the
        story. Text only, video, or audio — not both video and audio.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["none", "Text only", hasVideo || hasAudio, hasVideo ? "Remove the video first" : hasAudio ? "Remove the audio first" : ""],
            ["video", "Video", hasAudio, "Remove the audio first"],
            ["audio", "Audio", hasVideo, "Remove the video first"],
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

      <label className="mb-1 block text-xs font-medium text-text-secondary">Image</label>
      <input
        type="file"
        accept={newsImageAccept}
        disabled={busy}
        className={`${fileInputClass} mb-2`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUpload(file, "image");
        }}
      />
      <UrlField
        value={imageUrl}
        placeholder="Or paste image URL (https://…)"
        onCommit={onImageUrl}
      />

      {mediaKind === "video" ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-text-secondary">Video URL</label>
            {hasVideo ? (
              <button
                type="button"
                disabled={busy}
                onClick={onRemoveVideo}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remove video
              </button>
            ) : null}
          </div>
          <input
            type="file"
            accept={newsVideoAccept}
            disabled={busy}
            className={`${fileInputClass} mb-2`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file, "video");
            }}
          />
          <UrlField
            value={videoUrl}
            placeholder="https://…/video.mp4"
            onCommit={onVideoUrl}
          />
        </div>
      ) : null}

      {mediaKind === "audio" ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-text-secondary">Audio URL</label>
            {hasAudio ? (
              <button
                type="button"
                disabled={busy}
                onClick={onRemoveAudio}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remove audio
              </button>
            ) : null}
          </div>
          <input
            type="file"
            accept={newsAudioAccept}
            disabled={busy}
            className={`${fileInputClass} mb-2`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file, "audio");
            }}
          />
          <UrlField
            value={audioUrl}
            placeholder="https://…/audio.mp3"
            onCommit={onAudioUrl}
          />
        </div>
      ) : null}

      {uploading ? (
        <p className="mt-2 text-xs text-text-secondary">Uploading {uploading}…</p>
      ) : null}
    </div>
  );
}
