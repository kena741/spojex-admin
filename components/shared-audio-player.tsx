"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { formatDuration } from "@/lib/media-library";

/** Only one SharedAudioPlayer plays at a time across the admin app. */
let activePlayerId: string | null = null;
const stopListeners = new Map<string, () => void>();

function claimPlayback(id: string, stop: () => void) {
  if (activePlayerId && activePlayerId !== id) {
    stopListeners.get(activePlayerId)?.();
  }
  activePlayerId = id;
  stopListeners.set(id, stop);
}

function releasePlayback(id: string) {
  if (activePlayerId === id) activePlayerId = null;
  stopListeners.delete(id);
}

export function SharedAudioPlayer({
  src,
  storedDurationSeconds,
  className,
}: {
  src: string;
  /** Prefer server-stored duration until metadata loads. */
  storedDurationSeconds?: number | null;
  className?: string;
}) {
  const id = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const url = toBackendMediaUrl(src);
  const [metaDuration, setMetaDuration] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [playError, setPlayError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const duration =
    metaDuration && metaDuration > 0
      ? metaDuration
      : storedDurationSeconds && storedDurationSeconds > 0
        ? storedDurationSeconds
        : null;

  useEffect(() => {
    setMetaDuration(null);
    setCurrent(0);
    setLoadingMeta(true);
    setPlayError(null);
    setPlaying(false);
  }, [url]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      releasePlayback(id);
    };
  }, [id]);

  if (!url) {
    return <span className="text-xs text-text-secondary">No audio</span>;
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/50 disabled:opacity-50"
          disabled={!!playError && !url}
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            if (playing) {
              el.pause();
              return;
            }
            claimPlayback(id, () => {
              el.pause();
              setPlaying(false);
            });
            setPlayError(null);
            void el.play().catch(() => {
              setPlayError("Could not play. Check the file format or try again.");
              setPlaying(false);
            });
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="tabular-nums text-xs text-text-secondary">
          {loadingMeta && duration == null
            ? "Loading…"
            : `${formatDuration(current)} / ${formatDuration(duration)}`}
        </span>
        {playError ? (
          <button
            type="button"
            className="text-xs text-red-600 hover:underline"
            onClick={() => {
              setPlayError(null);
              setLoadingMeta(true);
              audioRef.current?.load();
            }}
          >
            Retry
          </button>
        ) : null}
      </div>
      {playError ? <p className="mt-1 text-[11px] text-red-600">{playError}</p> : null}
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        className="sr-only"
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          if (d && Number.isFinite(d) && d > 0) setMetaDuration(d);
          setLoadingMeta(false);
        }}
        onDurationChange={() => {
          const d = audioRef.current?.duration;
          if (d && Number.isFinite(d) && d > 0) {
            setMetaDuration(d);
            setLoadingMeta(false);
          }
        }}
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
        onPlay={() => {
          setPlaying(true);
          claimPlayback(id, () => {
            audioRef.current?.pause();
            setPlaying(false);
          });
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          releasePlayback(id);
        }}
        onError={() => {
          setLoadingMeta(false);
          setPlayError("Playback failed. The URL may be invalid or the format unsupported.");
          setPlaying(false);
        }}
      />
    </div>
  );
}
