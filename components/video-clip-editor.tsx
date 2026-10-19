"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toBackendMediaUrl } from "@/lib/spojex-media";

function formatTime(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function VideoClipEditor({
  videoUrl,
  articleId = null,
  disabled,
  onTrimmed,
}: {
  videoUrl: string;
  articleId?: string | null;
  disabled?: boolean;
  onTrimmed: (result: {
    publicUrl: string;
    durationSeconds: number | null;
  }) => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [trimming, setTrimming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const src = useMemo(() => toBackendMediaUrl(videoUrl), [videoUrl]);

  useEffect(() => {
    setStart(0);
    setEnd(0);
    setDuration(0);
    setError(null);
  }, [videoUrl]);

  useEffect(() => {
    if (duration > 0 && end <= 0) setEnd(duration);
  }, [duration, end]);

  const clipLength = Math.max(0, end - start);
  const canTrim =
    !disabled &&
    !trimming &&
    duration > 0 &&
    end > start + 0.25 &&
    (start > 0.05 || end < duration - 0.05);

  const applyTrim = async () => {
    if (!canTrim) return;
    setTrimming(true);
    setError(null);
    try {
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
      await onTrimmed({
        publicUrl: toBackendMediaUrl(payload.publicUrl),
        durationSeconds:
          typeof payload.durationSeconds === "number"
            ? payload.durationSeconds
            : Math.round(clipLength),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trim failed");
    } finally {
      setTrimming(false);
    }
  };

  const previewClip = () => {
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

  return (
    <div className="mb-3 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-secondary">Trim video</p>
        <p className="text-[11px] text-text-hint">
          {duration > 0
            ? `Full ${formatTime(duration)} · selection ${formatTime(clipLength)}`
            : "Loading duration…"}
        </p>
      </div>

      <video
        ref={videoRef}
        key={src}
        src={src}
        controls
        playsInline
        className="h-40 w-full rounded-md bg-black object-contain"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (!Number.isFinite(d) || d <= 0) return;
          setDuration(d);
          setEnd((prev) => (prev > 0 && prev <= d ? prev : d));
        }}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs">
          <span className="text-text-secondary">Start ({formatTime(start)})</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.1}
            value={Math.min(start, duration || 0)}
            disabled={disabled || trimming || duration <= 0}
            onChange={(e) => {
              const next = Number(e.target.value);
              setStart(next);
              if (next >= end) setEnd(Math.min(duration, next + 0.5));
            }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-text-secondary">End ({formatTime(end)})</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.1}
            value={Math.min(end, duration || 0)}
            disabled={disabled || trimming || duration <= 0}
            onChange={(e) => {
              const next = Number(e.target.value);
              setEnd(next);
              if (next <= start) setStart(Math.max(0, next - 0.5));
            }}
          />
        </label>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || trimming || duration <= 0 || end <= start}
          onClick={previewClip}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Preview selection
        </button>
        <button
          type="button"
          disabled={!canTrim}
          onClick={() => void applyTrim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {trimming ? "Trimming…" : "Apply trim"}
        </button>
      </div>
    </div>
  );
}
