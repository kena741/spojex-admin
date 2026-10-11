"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import {
  newsAudioAccept,
  newsImageAccept,
  newsVideoAccept,
  resolveNewsStoryMedia,
  validateNewsMedia,
  type NewsStoryMedia,
  type NewsUploadKind,
} from "@/lib/news-media";

const fileInputClass =
  "block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground";

async function readJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error("Upload failed. Try a smaller file or refresh the page.");
  }
  try {
    return JSON.parse(text) as { error?: string; path?: string; token?: string; publicUrl?: string };
  } catch {
    throw new Error("Upload failed. Unexpected server response.");
  }
}

export async function uploadNewsFile(articleId: string | null, file: File, kind: NewsUploadKind) {
  const invalid = validateNewsMedia(kind, file.type, file.name, file.size);
  if (invalid) throw new Error(invalid);

  const endpoint = articleId ? `/api/admin/news/${articleId}/media` : "/api/admin/news/media";
  const signResponse = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });
  const signed = await readJson(signResponse);
  if (!signResponse.ok) throw new Error(signed.error || "Upload could not start");
  if (!signed.path || !signed.token || !signed.publicUrl) {
    throw new Error("Upload could not start. Run 074_news_media.sql in Supabase.");
  }

  const { error: uploadError } = await getSupabase().storage
    .from("sport-news")
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type || undefined,
    });
  if (uploadError) throw new Error(uploadError.message);
  return signed.publicUrl;
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
  const image = imageUrl.trim();
  const video = videoUrl.trim();
  const audio = audioUrl.trim();

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
        Text only, video, or audio. After a video or audio file is uploaded, remove it before choosing the other
        type. The image is used as the story image and the cover.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["none", "Text only", hasVideo || hasAudio, hasVideo ? "Remove the video first" : hasAudio ? "Remove the audio first" : ""],
            ["video", "Video", hasAudio, "Remove the audio file first"],
            ["audio", "Audio", hasVideo, "Remove the video file first"],
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

      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-text-secondary">Image</span>
        <input
          type="file"
          accept={newsImageAccept}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file, "image");
            event.target.value = "";
          }}
          className={`mb-2 ${fileInputClass}`}
        />
        <UrlField value={imageUrl} onCommit={onImageUrl} placeholder="or paste image URL" />
        <p className="mt-1 text-xs text-text-secondary">JPG, PNG, WebP, or GIF · max 5 MB</p>
        {uploading === "image" ? <p className="mt-1 text-xs text-text-secondary">Uploading image…</p> : null}
      </label>

      {mediaKind === "video" ? (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-sm font-medium">Video file</p>
          <input
            type="file"
            accept={newsVideoAccept}
            disabled={busy || hasAudio}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file, "video");
              event.target.value = "";
            }}
            className={fileInputClass}
          />
          <p className="mt-1 text-xs text-text-secondary">MP4, WebM, or MOV · max 50 MB</p>
          {uploading === "video" ? <p className="mt-1 text-xs text-text-secondary">Uploading video…</p> : null}
          <div className="mt-2">
            <UrlField value={videoUrl} onCommit={onVideoUrl} placeholder="or paste a direct video URL" />
          </div>
          {hasVideo ? (
            <button
              type="button"
              onClick={onRemoveVideo}
              className="mt-2 text-xs font-medium text-red-700 hover:underline"
            >
              Remove video
            </button>
          ) : null}
        </div>
      ) : null}

      {mediaKind === "audio" ? (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-sm font-medium">Audio file</p>
          <input
            type="file"
            accept={newsAudioAccept}
            disabled={busy || hasVideo}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file, "audio");
              event.target.value = "";
            }}
            className={fileInputClass}
          />
          <p className="mt-1 text-xs text-text-secondary">MP3, M4A, AAC, WAV, or OGG · max 20 MB</p>
          {uploading === "audio" ? <p className="mt-1 text-xs text-text-secondary">Uploading audio…</p> : null}
          <div className="mt-2">
            <UrlField value={audioUrl} onCommit={onAudioUrl} placeholder="or paste a direct audio URL" />
          </div>
          {hasAudio ? (
            <button
              type="button"
              onClick={onRemoveAudio}
              className="mt-2 text-xs font-medium text-red-700 hover:underline"
            >
              Remove audio
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
