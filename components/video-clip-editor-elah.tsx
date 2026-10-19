"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EditorProvider,
  Preview,
  Timeline,
  beginImportUrl,
  createDefaultDemuxerFactory,
  exportVideo,
  framesToTimecode,
  growClipToAssetDuration,
  insertMediaAsset,
  mediaLibraryStore,
  splitClipAtPlayhead,
  transformFromCoverRect,
  usePlaybackStore,
  useSelectionStore,
  useTimelineEngine,
} from "@elah/editor";
import "@elah/editor/styles.css";
import { toBackendMediaUrl } from "@/lib/spojex-media";

const FPS = 30;
const STAGE = { width: 1080, height: 1920 } as const;
const demuxerFactory = createDefaultDemuxerFactory();

type Props = {
  videoUrl: string;
  articleId?: string | null;
  disabled?: boolean;
  onTrimmed: (result: {
    publicUrl: string;
    durationSeconds: number | null;
  }) => void | Promise<void>;
};

function LoadUploadedVideo({ proxyUrl }: { proxyUrl: string }) {
  const engine = useTimelineEngine();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !proxyUrl) return;
    started.current = true;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        const asset = await beginImportUrl(proxyUrl);
        if (cancelled) return;
        const result = await insertMediaAsset(engine, asset.id, {
          videoOnly: true,
          desiredStartFrame: 0,
        });
        if (!result.ok || cancelled) return;
        const clipId = result.clipIds[0];
        if (!clipId) return;
        const found = engine.findClip(clipId);
        const fallbackFrames = found?.clip.durationFrames ?? FPS * 3;

        const applyReady = (durationSec: number, width?: number, height?: number) => {
          growClipToAssetDuration(engine, clipId, fallbackFrames, durationSec);
          if (width && height && width > 0 && height > 0) {
            engine.updateClip(clipId, result.trackId, {
              transform: transformFromCoverRect(
                width,
                height,
                STAGE.width,
                STAGE.height,
              ),
              name: "Clip",
            });
          }
        };

        const readyNow = mediaLibraryStore.getState().assets[asset.id];
        if (readyNow?.status === "ready") {
          applyReady(readyNow.durationSec, readyNow.width, readyNow.height);
          return;
        }

        unsubscribe = mediaLibraryStore.subscribe((state) => {
          const ready = state.assets[asset.id];
          if (ready?.status !== "ready") return;
          unsubscribe?.();
          unsubscribe = undefined;
          applyReady(ready.durationSec, ready.width, ready.height);
        });
      } catch {
        // leave timeline empty
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [engine, proxyUrl]);

  return null;
}

function Toolbar({
  disabled,
  saving,
  exportProgress,
  onSave,
  error,
}: {
  disabled?: boolean;
  saving: boolean;
  exportProgress: string | null;
  onSave: () => void;
  error: string | null;
}) {
  const engine = useTimelineEngine();
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const currentFrame = usePlaybackStore((s) => s.currentFrame);
  const togglePlayPause = usePlaybackStore((s) => s.togglePlayPause);
  const selectedClipIds = useSelectionStore((s) => s.selectedClipIds);
  const busy = Boolean(disabled) || saving;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => togglePlayPause()}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => splitClipAtPlayhead(engine)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Split
        </button>
        <button
          type="button"
          disabled={busy || selectedClipIds.size === 0}
          onClick={() => {
            for (const clipId of selectedClipIds) {
              const found = engine.findClip(clipId);
              if (found) engine.removeClip(clipId, found.trackId);
            }
          }}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Cut / delete
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => engine.undo()}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => engine.redo()}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Redo
        </button>
        <span className="font-mono text-[11px] text-text-hint">
          {framesToTimecode(currentFrame, FPS)}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="ml-auto rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? exportProgress || "Saving…" : "Save edit"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function Shell({ videoUrl, articleId, disabled, onTrimmed }: Props) {
  const engine = useTimelineEngine();
  const [saving, setSaving] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const proxyUrl = useMemo(() => {
    const raw = videoUrl.trim();
    if (!raw) return "";
    return `/api/admin/news/media/source?url=${encodeURIComponent(raw)}`;
  }, [videoUrl]);

  const onSave = useCallback(async () => {
    if (disabled || saving) return;
    setSaving(true);
    setError(null);
    setExportProgress("Exporting…");
    try {
      const project = engine.getProject();
      const blob = await exportVideo(project, {
        videoCodec: "avc",
        audioCodec: "aac",
        outputHeight: STAGE.height,
        onProgress: ({ frame, totalFrames }) => {
          if (totalFrames <= 0) return;
          const pct = Math.min(99, Math.round((frame / totalFrames) * 100));
          setExportProgress(`Exporting ${pct}%…`);
        },
      });
      setExportProgress("Uploading…");
      const file = new File([blob], `news-edit-${Date.now()}.mp4`, {
        type: "video/mp4",
      });
      const endpoint = articleId
        ? `/api/admin/news/${articleId}/media`
        : "/api/admin/news/media";
      const body = new FormData();
      body.set("kind", "video");
      body.set("file", file, file.name);
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        body,
      });
      const text = await response.text();
      const payload = text.trim()
        ? (JSON.parse(text) as { error?: string; publicUrl?: string })
        : {};
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      if (!payload.publicUrl) throw new Error("Upload failed. No public URL was returned.");
      const durationSec = project.fps > 0 ? engine.getTotalFrames() / project.fps : null;
      await onTrimmed({
        publicUrl: toBackendMediaUrl(payload.publicUrl),
        durationSeconds:
          durationSec != null && Number.isFinite(durationSec)
            ? Math.round(durationSec)
            : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
      setExportProgress(null);
    }
  }, [articleId, disabled, engine, onTrimmed, saving]);

  return (
    <div className="elah-news-editor space-y-3">
      <LoadUploadedVideo proxyUrl={proxyUrl} />
      <Toolbar
        disabled={disabled}
        saving={saving}
        exportProgress={exportProgress}
        onSave={() => void onSave()}
        error={error}
      />
      <div className="flex justify-center rounded-lg bg-black/95 p-3">
        <div
          className="relative w-full max-w-[240px] overflow-hidden rounded-md bg-black"
          style={{ aspectRatio: "9 / 16" }}
        >
          <Preview
            demuxerFactory={demuxerFactory}
            enableAudio
            className="absolute inset-0 h-full w-full"
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <Timeline fps={FPS} style={{ height: 200 }} />
      </div>
    </div>
  );
}

export default function VideoClipEditorElah(props: Props) {
  const srcKey = toBackendMediaUrl(props.videoUrl) || props.videoUrl;

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-secondary">Edit video</p>
        <p className="text-[11px] text-text-hint">9:16 TikTok · timeline editor</p>
      </div>
      <EditorProvider
        key={srcKey}
        fps={FPS}
        stage={STAGE}
        initialTracks={[
          { kind: "video", name: "Video", protected: true },
          { kind: "audio", name: "Audio", protected: true },
        ]}
      >
        <Shell {...props} />
      </EditorProvider>
    </div>
  );
}
