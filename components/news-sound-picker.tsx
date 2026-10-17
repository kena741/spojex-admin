"use client";

import { useEffect, useMemo, useState } from "react";
import {
  NEWS_SOUND_KINDS,
  newsSoundKindLabel,
  type SportNewsSoundRow,
} from "@/lib/news-sounds";
import { toBackendMediaUrl } from "@/lib/spojex-media";

export function NewsSoundPicker({
  soundId,
  disabled,
  onSelect,
}: {
  soundId: string;
  disabled?: boolean;
  onSelect: (sound: SportNewsSoundRow | null) => void;
}) {
  const [rows, setRows] = useState<SportNewsSoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/admin/news-sounds", {
          credentials: "same-origin",
        });
        const payload = (await response.json()) as {
          data?: SportNewsSoundRow[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load sounds");
        if (!cancelled) {
          setRows((payload.data ?? []).filter((row) => row.is_active && row.audio_url.trim()));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load sounds");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (kind === "all") return rows;
    return rows.filter((row) => row.kind === kind);
  }, [kind, rows]);

  const selected = rows.find((row) => row.id === soundId) ?? null;

  return (
    <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-text-secondary">Image soundtrack</p>
          <p className="text-[11px] text-text-hint">
            Optional library sound for image posts (not for video).
          </p>
        </div>
        <select
          value={kind}
          disabled={disabled || loading}
          onChange={(e) => setKind(e.target.value)}
          className="h-8 rounded-md border border-border bg-card px-2 text-xs"
        >
          <option value="all">All kinds</option>
          {NEWS_SOUND_KINDS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-xs text-text-secondary">Loading sounds…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-text-secondary">
          No active sounds. Add tracks in Sound library.
        </p>
      ) : (
        <select
          value={soundId}
          disabled={disabled}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) {
              onSelect(null);
              return;
            }
            const next = rows.find((row) => row.id === id) ?? null;
            onSelect(next);
          }}
          className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
        >
          <option value="">No sound</option>
          {filtered.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} · {newsSoundKindLabel(row.kind)}
            </option>
          ))}
        </select>
      )}

      {selected?.audio_url ? (
        <audio
          key={selected.id}
          src={toBackendMediaUrl(selected.audio_url)}
          controls
          className="mt-2 w-full"
        />
      ) : null}
    </div>
  );
}
