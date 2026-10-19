"use client";

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { toBackendMediaUrl } from "@/lib/spojex-media";

type TrimResult = {
  publicUrl: string;
  durationSeconds: number | null;
};

export type VideoClipEditorProps = {
  videoUrl: string;
  articleId?: string | null;
  disabled?: boolean;
  onTrimmed: (result: TrimResult) => void | Promise<void>;
};

function formatTime(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function hasWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    return Boolean(gl);
  } catch {
    return false;
  }
}

async function applyServerTrim(
  articleId: string | null | undefined,
  videoUrl: string,
  start: number,
  end: number,
): Promise<TrimResult> {
  const endpoint = articleId
    ? `/api/admin/news/${articleId}/media`
    : "/api/admin/news/media";
  const body = new FormData();
  body.set("action", "trim");
  body.set("source_url", videoUrl);
  body.set("start_seconds", String(start));
  body.set("end_seconds", String(end));
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as {
        error?: string;
        publicUrl?: string;
        durationSeconds?: number | null;
      })
    : {};
  if (!response.ok) throw new Error(payload.error || "Trim failed");
  if (!payload.publicUrl) throw new Error("Trim failed. No URL returned.");
  return {
    publicUrl: toBackendMediaUrl(payload.publicUrl),
    durationSeconds:
      typeof payload.durationSeconds === "number"
        ? payload.durationSeconds
        : Math.max(0, Math.round(end - start)),
  };
}

/** HTML5 vertical trimmer — works without WebGL. */
function HtmlVerticalTrimEditor({
  videoUrl,
  articleId = null,
  disabled,
  onTrimmed,
  webglBlocked,
}: VideoClipEditorProps & { webglBlocked?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [drag, setDrag] = useState<"start" | "end" | "playhead" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const src = useMemo(() => toBackendMediaUrl(videoUrl), [videoUrl]);

  useEffect(() => {
    setStart(0);
    setEnd(0);
    setDuration(0);
    setCurrent(0);
    setError(null);
  }, [videoUrl]);

  useEffect(() => {
    if (duration > 0 && end <= 0) setEnd(duration);
  }, [duration, end]);

  const clipLength = Math.max(0, end - start);
  const canTrim =
    !disabled &&
    !saving &&
    duration > 0 &&
    end > start + 0.25 &&
    (start > 0.05 || end < duration - 0.05);

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const t = timeFromClientX(event.clientX);
      if (drag === "start") {
        const next = Math.min(t, end - 0.25);
        setStart(Math.max(0, next));
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, next);
      } else if (drag === "end") {
        const next = Math.max(t, start + 0.25);
        setEnd(Math.min(duration, next));
        if (videoRef.current) videoRef.current.currentTime = Math.min(duration, next);
      } else {
        setCurrent(t);
        if (videoRef.current) videoRef.current.currentTime = t;
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, duration, end, start, timeFromClientX]);

  const previewSelection = () => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = start;
    void el.play();
    const stopAt = end;
    const onTime = () => {
      if (el.currentTime >= stopAt) {
        el.pause();
        el.removeEventListener("timeupdate", onTime);
      }
    };
    el.addEventListener("timeupdate", onTime);
  };

  const applyTrim = async () => {
    if (!canTrim) return;
    setSaving(true);
    setError(null);
    try {
      const result = await applyServerTrim(articleId, videoUrl, start, end);
      await onTrimmed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trim failed");
    } finally {
      setSaving(false);
    }
  };

  const startPct = duration > 0 ? (start / duration) * 100 : 0;
  const endPct = duration > 0 ? (end / duration) * 100 : 100;
  const playPct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="mb-3 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-secondary">Edit video</p>
        <p className="text-[11px] text-text-hint">
          9:16 TikTok ·{" "}
          {duration > 0
            ? `full ${formatTime(duration)} · keep ${formatTime(clipLength)}`
            : "loading…"}
        </p>
      </div>

      {webglBlocked ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          Timeline editor needs WebGL (not available here). Using vertical trim — open in
          Chrome/Safari desktop for split/cut timeline.
        </p>
      ) : null}

      <div className="flex justify-center rounded-lg bg-black p-3">
        <div
          className="relative w-full max-w-[240px] overflow-hidden rounded-md bg-black"
          style={{ aspectRatio: "9 / 16" }}
        >
          <video
            ref={videoRef}
            key={src}
            src={src}
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (!Number.isFinite(d) || d <= 0) return;
              setDuration(d);
              setEnd((prev) => (prev > 0 && prev <= d ? prev : d));
            }}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || saving || duration <= 0}
          onClick={() => {
            const el = videoRef.current;
            if (!el) return;
            if (el.paused) void el.play();
            else el.pause();
          }}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Play / pause
        </button>
        <button
          type="button"
          disabled={disabled || saving || duration <= 0}
          onClick={() => {
            const t = Math.min(current, end - 0.25);
            setStart(Math.max(0, t));
          }}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Set in
        </button>
        <button
          type="button"
          disabled={disabled || saving || duration <= 0}
          onClick={() => {
            const t = Math.max(current, start + 0.25);
            setEnd(Math.min(duration, t));
          }}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Set out
        </button>
        <button
          type="button"
          disabled={disabled || saving || duration <= 0 || end <= start}
          onClick={previewSelection}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Preview keep
        </button>
        <button
          type="button"
          disabled={!canTrim}
          onClick={() => void applyTrim()}
          className="ml-auto rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Apply trim"}
        </button>
      </div>

      <div className="space-y-1">
        <div
          ref={trackRef}
          className="relative h-10 cursor-pointer rounded-md bg-muted"
          onPointerDown={(event) => {
            if (disabled || saving || duration <= 0) return;
            const t = timeFromClientX(event.clientX);
            setCurrent(t);
            if (videoRef.current) videoRef.current.currentTime = t;
            setDrag("playhead");
          }}
        >
          <div
            className="absolute inset-y-0 bg-primary/35"
            style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
          />
          <div
            className="absolute top-0 bottom-0 z-10 w-0.5 bg-white"
            style={{ left: `${playPct}%` }}
          />
          <button
            type="button"
            aria-label="Trim start"
            className="absolute top-0 bottom-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm bg-primary"
            style={{ left: `${startPct}%` }}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (disabled || saving) return;
              setDrag("start");
            }}
          />
          <button
            type="button"
            aria-label="Trim end"
            className="absolute top-0 bottom-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm bg-primary"
            style={{ left: `${endPct}%` }}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (disabled || saving) return;
              setDrag("end");
            }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-text-hint">
          <span>In {formatTime(start)}</span>
          <span>{formatTime(current)}</span>
          <span>Out {formatTime(end)}</span>
        </div>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

class WebGLErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (typeof console !== "undefined") {
      console.warn("[VideoClipEditor] falling back to HTML trimmer:", error.message);
    }
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

const ElahEditor = dynamic(() => import("@/components/video-clip-editor-elah"), {
  ssr: false,
  loading: () => (
    <div className="mb-3 rounded-lg border border-border bg-muted/30 p-4 text-xs text-text-secondary">
      Loading timeline editor…
    </div>
  ),
});

export function VideoClipEditor(props: VideoClipEditorProps) {
  const [mode, setMode] = useState<"checking" | "elah" | "html">("checking");

  useEffect(() => {
    setMode(hasWebGL2() ? "elah" : "html");
  }, []);

  if (mode === "checking") {
    return (
      <div className="mb-3 rounded-lg border border-border bg-muted/30 p-4 text-xs text-text-secondary">
        Preparing video editor…
      </div>
    );
  }

  if (mode === "html") {
    return <HtmlVerticalTrimEditor {...props} webglBlocked />;
  }

  return (
    <WebGLErrorBoundary fallback={<HtmlVerticalTrimEditor {...props} webglBlocked />}>
      <ElahEditor {...props} />
    </WebGLErrorBoundary>
  );
}
