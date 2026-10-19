"use client";

import { useEffect, useMemo, useState } from "react";
import {
  NEWS_SOUND_KINDS,
  SOUNDTRACK_SOURCE_LABEL,
  newsSoundKindLabel,
  shortSoundTitle,
  type SoundtrackCatalogItem,
  type SportNewsSoundRow,
} from "@/lib/news-sounds";
import { postAdmin } from "@/lib/hooks";
import { toBackendMediaUrl } from "@/lib/spojex-media";

export function NewsSoundPicker({
  soundId,
  audioUrl = "",
  disabled,
  onSelect,
}: {
  soundId: string;
  audioUrl?: string;
  disabled?: boolean;
  /** Return false / error string when the parent failed to persist the choice. */
  onSelect: (
    sound: SportNewsSoundRow | null,
  ) => void | boolean | string | Promise<void | boolean | string>;
}) {
  const [rows, setRows] = useState<SoundtrackCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
  const [source, setSource] = useState<"all" | SoundtrackCatalogItem["source"]>("all");
  const [query, setQuery] = useState("");

  const load = async () => {
    const response = await fetch("/api/admin/news-sounds/catalog", {
      credentials: "same-origin",
    });
    const payload = (await response.json()) as {
      data?: SoundtrackCatalogItem[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load sounds");
    setRows(payload.data ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
        if (!cancelled) setError(null);
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
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind !== "all" && row.kind !== kind) return false;
      if (source !== "all" && row.source !== source) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.kind.toLowerCase().includes(q) ||
        SOUNDTRACK_SOURCE_LABEL[row.source].toLowerCase().includes(q)
      );
    });
  }, [kind, query, rows, source]);

  const selectedKey = useMemo(() => {
    if (soundId.trim()) {
      const hit = rows.find(
        (row) => row.sound_id === soundId || row.key === `library:${soundId}`,
      );
      if (hit) return hit.key;
    }
    const url = toBackendMediaUrl(audioUrl.trim());
    if (url) {
      const hit = rows.find((row) => toBackendMediaUrl(row.audio_url) === url);
      if (hit) return hit.key;
    }
    return "";
  }, [audioUrl, rows, soundId]);

  const selected = rows.find((row) => row.key === selectedKey) ?? null;

  const applySelection = async (sound: SportNewsSoundRow | null) => {
    const result = await onSelect(sound);
    if (result === false) {
      throw new Error("Could not apply soundtrack. Try again.");
    }
    if (typeof result === "string" && result.trim()) {
      throw new Error(result.trim());
    }
  };

  const pick = async (item: SoundtrackCatalogItem | null) => {
    if (disabled || promoting) return;
    setError(null);
    if (!item) {
      try {
        await applySelection(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not clear sound");
      }
      return;
    }

    if (item.sound_id) {
      try {
        await applySelection({
          id: item.sound_id,
          name: shortSoundTitle(item.name),
          kind: item.kind,
          audio_url: item.audio_url,
          duration_seconds: null,
          sort_order: 0,
          is_active: true,
          created_at: "",
          updated_at: "",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not select sound");
      }
      return;
    }

    // Promote news/media audio into the sound library so soundtrack stays linked.
    setPromoting(true);
    try {
      const row = (await postAdmin("/api/admin/news-sounds", {
        name: shortSoundTitle(item.name),
        kind: item.kind || "general",
        audio_url: item.audio_url,
        is_active: true,
        sort_order: 0,
      })) as SportNewsSoundRow;
      if (!row?.id) throw new Error("Could not add sound to library");
      await load();
      await applySelection(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select sound");
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-text-secondary">Image soundtrack</p>
          <p className="text-[11px] text-text-hint">
            Pick from the sound library ({rows.length}). Long file names are shortened.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={source}
            disabled={disabled || loading}
            onChange={(e) => setSource(e.target.value as typeof source)}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs"
          >
            <option value="all">All sources</option>
            <option value="library">Library</option>
            <option value="news">News audio</option>
            <option value="media">Uploads</option>
          </select>
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
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled || loading}
        placeholder="Search Spojex audio…"
        className="mb-2 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
      />

      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-xs text-text-secondary">Loading Spojex audio…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-text-secondary">
          No audio found. Upload tracks in Sound library or publish news with audio.
        </p>
      ) : (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            disabled={disabled || promoting}
            onClick={() => void pick(null)}
            className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm ${
              !selectedKey ? "bg-primary/10 text-primary" : "hover:bg-muted"
            }`}
          >
            <span>No sound</span>
          </button>
          {filtered.map((row) => {
            const active = row.key === selectedKey;
            const label = shortSoundTitle(row.name);
            return (
              <button
                key={row.key}
                type="button"
                disabled={disabled || promoting}
                title={row.name !== label ? row.name : undefined}
                onClick={() => void pick(row)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm ${
                  active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                <span className="min-w-0 truncate font-medium">{label}</span>
                <span className="shrink-0 text-[11px] text-text-hint">
                  {SOUNDTRACK_SOURCE_LABEL[row.source]} · {newsSoundKindLabel(row.kind)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {promoting ? (
        <p className="mt-2 text-xs text-text-secondary">Adding to sound library…</p>
      ) : null}

      {selected?.audio_url ? (
        <audio
          key={selected.key}
          src={toBackendMediaUrl(selected.audio_url)}
          controls
          className="mt-2 w-full"
        />
      ) : null}
    </div>
  );
}
