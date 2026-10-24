"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Film,
  ImageIcon,
  Mic,
  Upload,
  X,
} from "lucide-react";
import { ImageCropDialog } from "@/components/news-composer/image-crop-dialog";
import {
  MediaEditTray,
  isLiveMediaEditTool,
  type MediaEditToolId,
} from "@/components/news-composer/media-edit-tray";
import { NewsSoundPicker } from "@/components/news-sound-picker";
import { VideoClipEditor } from "@/components/video-clip-editor";
import {
  isNewsVideoFile,
  newsAudioAccept,
  newsImageAccept,
  newsVideoAccept,
  validateNewsMedia,
  type NewsUploadKind,
} from "@/lib/news-media";
import type { SportNewsSoundRow } from "@/lib/news-sounds";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { cn } from "@/lib/utils";
import type { NewsUploadOptions } from "@/components/news-media-fields";

export type ComposerMediaMode = "empty" | "image" | "video" | "audio" | "text";

type MediaStageProps = {
  articleId: string | null;
  mode: ComposerMediaMode;
  imageUrls: string[];
  videoUrl: string;
  audioUrl: string;
  soundId: string;
  soundName?: string;
  coverUrl: string;
  uploading: NewsUploadKind | null;
  uploadPercent: number;
  disabled?: boolean;
  onUpload: (
    file: File,
    kind: NewsUploadKind,
    options?: NewsUploadOptions,
  ) => void | Promise<void>;
  onReorderImages: (urls: string[]) => void;
  onRemoveImageAt: (index: number) => void;
  onClearMedia: () => void;
  onRemoveVideo: () => void;
  onRemoveAudio: () => void;
  onTrimVideo: (result: { publicUrl: string; durationSeconds: number | null }) => void;
  onSoundSelect: (sound: SportNewsSoundRow | null) => void | boolean | string | Promise<void | boolean | string>;
  onReplaceImageAt: (index: number, file: File) => void | Promise<void>;
  onSetCoverFromVideo: (url: string) => void;
  onFocusCaption?: (field: "title" | "body") => void;
};

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function detectKind(file: File): NewsUploadKind | null {
  if (isNewsVideoFile(file.type, file.name)) return "video";
  if (file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg)$/i.test(file.name)) {
    return "audio";
  }
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
    return "image";
  }
  return null;
}

export function MediaStage({
  articleId,
  mode,
  imageUrls,
  videoUrl,
  audioUrl,
  soundId,
  soundName = "",
  coverUrl,
  uploading,
  uploadPercent,
  disabled,
  onUpload,
  onReorderImages,
  onRemoveImageAt,
  onClearMedia,
  onRemoveVideo,
  onRemoveAudio,
  onTrimVideo,
  onSoundSelect,
  onReplaceImageAt,
  onSetCoverFromVideo: _onSetCoverFromVideo,
  onFocusCaption,
}: MediaStageProps) {
  const [dragOver, setDragOver] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const [soundOpen, setSoundOpen] = useState(false);
  const [soundSheetReady, setSoundSheetReady] = useState(false);
  const [activeTool, setActiveTool] = useState<MediaEditToolId | null>(null);
  const [soonTool, setSoonTool] = useState<MediaEditToolId | null>(null);
  const [lastFileMeta, setLastFileMeta] = useState<{ name: string; size: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clipEditorRef = useRef<HTMLDivElement>(null);
  const busy = Boolean(uploading) || Boolean(disabled);

  const openSoundSheet = useCallback(() => {
    setSoundSheetReady(true);
    setSoundOpen(true);
  }, []);

  const handleEditTool = useCallback(
    (id: MediaEditToolId) => {
      if (!isLiveMediaEditTool(id)) {
        setSoonTool(id);
        setActiveTool(id);
        return;
      }
      setSoonTool(null);
      setActiveTool(id);
      if (id === "edit") {
        if (mode === "image" && imageUrls.length > 0) {
          setCropIndex(0);
          return;
        }
        if (mode === "video") {
          clipEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return;
        }
        if (mode === "audio" && imageUrls.length > 0) {
          setCropIndex(0);
          return;
        }
        setHint(
          mode === "video"
            ? "Use the trim handles on the video to cut."
            : "Add a cover image to crop, or use Sound / Caption.",
        );
        return;
      }
      if (id === "sound") {
        openSoundSheet();
        return;
      }
      if (id === "text") {
        onFocusCaption?.("title");
        return;
      }
      if (id === "caption") {
        onFocusCaption?.("body");
      }
    },
    [imageUrls.length, mode, onFocusCaption, openSoundSheet],
  );

  const acceptFiles = useCallback(
    async (files: File[]) => {
      if (busy || files.length === 0) return;
      setHint(null);
      for (const file of files) {
        const kind = detectKind(file);
        if (!kind) {
          setHint("Use an image, video, or audio file.");
          continue;
        }
        if (mode === "video" && kind === "image") {
          // Cover for video
          const invalid = validateNewsMedia("image", file.type, file.name, file.size);
          if (invalid) {
            setHint(invalid);
            continue;
          }
          setLastFileMeta({ name: file.name, size: file.size });
          await onUpload(file, "image");
          continue;
        }
        if (mode === "audio" && kind === "image") {
          const invalid = validateNewsMedia("image", file.type, file.name, file.size);
          if (invalid) {
            setHint(invalid);
            continue;
          }
          setLastFileMeta({ name: file.name, size: file.size });
          await onUpload(file, "image");
          continue;
        }
        if (mode !== "empty" && mode !== "text" && kind !== mode && !(mode === "image" && kind === "image")) {
          if (mode === "image" && kind !== "image") {
            setHint("Remove images first to switch to video or audio.");
            return;
          }
          if (mode === "video" && kind !== "video" && kind !== "image") {
            setHint("Remove the video first to switch media type.");
            return;
          }
          if (mode === "audio" && kind !== "audio" && kind !== "image") {
            setHint("Remove the audio first to switch media type.");
            return;
          }
        }
        const invalid = validateNewsMedia(kind, file.type, file.name, file.size);
        if (invalid) {
          setHint(invalid);
          continue;
        }
        setLastFileMeta({ name: file.name, size: file.size });
        await onUpload(file, kind);
        if (kind !== "image") break;
      }
    },
    [busy, mode, onUpload],
  );

  const acceptAttr =
    mode === "video"
      ? `${newsVideoAccept},${newsImageAccept}`
      : mode === "audio"
        ? `${newsAudioAccept},${newsImageAccept}`
        : mode === "image"
          ? newsImageAccept
          : `${newsImageAccept},${newsVideoAccept},${newsAudioAccept}`;

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const files = event.clipboardData?.files
        ? Array.from(event.clipboardData.files)
        : [];
      if (!files.length) return;
      event.preventDefault();
      void acceptFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptFiles]);

  return (
    <div className="space-y-3">
      {mode === "empty" || mode === "text" ? (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            if (!busy) setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void acceptFiles(Array.from(e.dataTransfer.files || []));
          }}
          className={cn(
            "flex min-h-55 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition",
            dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30",
          )}
        >
          <div className="grid h-12 w-12 place-items-center rounded-full bg-card shadow-sm">
            <Upload className="h-5 w-5 text-text-secondary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Add media</p>
            <p className="mt-1 text-xs text-text-secondary">
              Drop, paste, or choose · Image, video, or audio
            </p>
            <p className="mt-1 text-[11px] text-text-hint">
              Images 5 MB · Video 50 MB · Audio 20 MB
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Choose files
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                /* text-only: parent can leave empty media */
                setHint("Add a headline to publish text-only, or upload media.");
              }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium"
            >
              Text only
            </button>
          </div>
          {uploading ? (
            <p className="text-xs font-medium text-primary">
              Uploading {uploading}… {uploadPercent}%
            </p>
          ) : null}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple={mode === "empty" || mode === "image"}
        accept={acceptAttr}
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          void acceptFiles(files);
        }}
      />

      {hint ? <p className="text-xs text-rose-600">{hint}</p> : null}
      {lastFileMeta && uploading ? (
        <p className="text-xs text-text-secondary">
          {lastFileMeta.name} · {formatBytes(lastFileMeta.size)}
        </p>
      ) : null}

      {mode === "image" ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="h-4 w-4" />
              Images
              <span className="text-xs font-normal text-text-hint">
                {imageUrls.length}/10
              </span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClearMedia}
              className="text-xs font-medium text-rose-600"
            >
              Remove all
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {imageUrls.map((url, index) => (
              <div
                key={`${url}-${index}`}
                className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={toBackendMediaUrl(url)}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {index === 0 ? (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                    Cover
                  </span>
                ) : null}
                <div className="absolute inset-x-0 top-0 flex justify-between gap-0.5 p-1">
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    className="rounded bg-black/60 px-1 text-[10px] text-white disabled:opacity-30"
                    onClick={() => {
                      if (index === 0) return;
                      const next = [...imageUrls];
                      const [item] = next.splice(index, 1);
                      next.splice(index - 1, 0, item);
                      onReorderImages(next);
                    }}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded bg-black/60 px-1 text-[10px] text-white"
                    onClick={() => onRemoveImageAt(index)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="absolute inset-x-0 bottom-0 flex gap-0.5 p-1">
                  <button
                    type="button"
                    disabled={busy}
                    className="flex-1 rounded bg-black/60 py-0.5 text-[10px] text-white"
                    onClick={() => setCropIndex(index)}
                  >
                    Crop
                  </button>
                  {index !== 0 ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="flex-1 rounded bg-black/60 py-0.5 text-[10px] text-white"
                      onClick={() => {
                        const next = [...imageUrls];
                        const [item] = next.splice(index, 1);
                        next.unshift(item);
                        onReorderImages(next);
                      }}
                    >
                      Cover
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {imageUrls.length < 10 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="grid h-28 w-20 shrink-0 place-items-center rounded-xl border border-dashed border-border text-xs text-text-secondary"
              >
                Add
              </button>
            ) : null}
          </div>
          <MediaEditTray
            disabled={busy}
            activeTool={activeTool}
            soonTool={soonTool}
            onTool={handleEditTool}
            onDismissSoon={() => {
              setSoonTool(null);
              setActiveTool(null);
            }}
          />
          {soundId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSoundSelect(null)}
              className="text-xs font-medium text-rose-600"
            >
              Remove soundtrack
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "video" ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Film className="h-4 w-4" />
              Video
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onRemoveVideo}
              className="text-xs font-medium text-rose-600"
            >
              Remove video
            </button>
          </div>
          {videoUrl ? (
            <div ref={clipEditorRef}>
              <VideoClipEditor
                videoUrl={videoUrl}
                articleId={articleId}
                disabled={busy}
                onTrimmed={onTrimVideo}
                onOpenSound={openSoundSheet}
                onFocusCaption={onFocusCaption}
                soundtrackUrl={soundId ? audioUrl : ""}
                soundtrackLabel={soundName || (soundId ? "Soundtrack on" : "")}
              />
            </div>
          ) : null}
          {soundId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSoundSelect(null)}
              className="text-xs font-medium text-rose-600"
            >
              Remove soundtrack
            </button>
          ) : null}
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-text-secondary">Cover</p>
            {coverUrl || imageUrls[0] ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={toBackendMediaUrl(coverUrl || imageUrls[0])}
                  alt=""
                  className="h-16 w-12 rounded-lg object-cover"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  className="text-xs font-medium text-primary"
                >
                  Replace cover
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="text-xs font-medium text-primary"
              >
                Upload cover image
              </button>
            )}
            <p className="mt-1 text-[11px] text-text-hint">
              Cover is separate from a gallery. Auto-captured from the first frame when missing.
            </p>
          </div>
        </div>
      ) : null}

      {mode === "audio" ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Mic className="h-4 w-4" />
              Audio
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onRemoveAudio}
              className="text-xs font-medium text-rose-600"
            >
              Remove audio
            </button>
          </div>
          {audioUrl ? (
            <audio controls src={toBackendMediaUrl(audioUrl)} className="w-full" preload="metadata" />
          ) : null}
          <MediaEditTray
            disabled={busy}
            activeTool={activeTool}
            soonTool={soonTool}
            onTool={handleEditTool}
            onDismissSoon={() => {
              setSoonTool(null);
              setActiveTool(null);
            }}
          />
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-text-secondary">Cover (optional)</p>
            {coverUrl || imageUrls[0] ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={toBackendMediaUrl(coverUrl || imageUrls[0])}
                  alt=""
                  className="h-16 w-16 rounded-lg object-cover"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  className="text-xs font-medium text-primary"
                >
                  Replace cover
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="text-xs font-medium text-primary"
              >
                Add cover image
              </button>
            )}
          </div>
        </div>
      ) : null}

      {cropIndex != null && imageUrls[cropIndex] ? (
        <ImageCropDialog
          open
          imageUrl={imageUrls[cropIndex]}
          onClose={() => setCropIndex(null)}
          onApply={async (file) => {
            await onReplaceImageAt(cropIndex, file);
          }}
        />
      ) : null}

      {soundSheetReady ? (
        <div
          className={cn(
            "fixed inset-0 z-50 flex justify-end bg-black/40 transition-opacity duration-150",
            soundOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-hidden={!soundOpen}
        >
          <button
            type="button"
            className="flex-1"
            aria-label="Close soundtrack library"
            tabIndex={soundOpen ? 0 : -1}
            onClick={() => setSoundOpen(false)}
          />
          <div
            className={cn(
              "flex h-full w-full max-w-md flex-col border-l border-border bg-background p-4 shadow-xl transition-transform duration-200",
              soundOpen ? "translate-x-0" : "translate-x-full",
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Soundtrack library"
          >
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Soundtrack</h2>
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                onClick={() => setSoundOpen(false)}
              >
                Done
              </button>
            </div>
            <NewsSoundPicker
              soundId={soundId}
              audioUrl={audioUrl}
              disabled={busy}
              heading={mode === "video" ? "Add sound to video" : "Image soundtrack"}
              hint={
                mode === "video"
                  ? "Plays over the clip in Studio (video audio muted while a track is selected). Stays open so you can preview & switch."
                  : "Curated library tracks. Panel stays open until you tap Done."
              }
              onSelect={async (sound) => onSoundSelect(sound)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
