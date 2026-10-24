"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Music2, Pause, Play, Search, X } from "lucide-react";
import {
  NEWS_SOUND_KINDS,
  displaySoundTitle,
  newsSoundKindLabel,
  shortSoundTitle,
  type SoundtrackCatalogItem,
  type SportNewsSoundRow,
} from "@/lib/news-sounds";
import { MediaPicker } from "@/components/media-picker";
import { patchAdmin } from "@/lib/hooks";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { cn } from "@/lib/utils";

type CatalogCache = {
  rows: SoundtrackCatalogItem[];
  at: number;
};

let catalogMemory: CatalogCache | null = null;
const CATALOG_TTL_MS = 5 * 60 * 1000;

async function fetchCatalog(force = false): Promise<SoundtrackCatalogItem[]> {
  if (
    !force &&
    catalogMemory &&
    Date.now() - catalogMemory.at < CATALOG_TTL_MS
  ) {
    return catalogMemory.rows;
  }
  const response = await fetch("/api/admin/news-sounds/catalog", {
    credentials: "same-origin",
  });
  const payload = (await response.json()) as {
    data?: SoundtrackCatalogItem[];
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error || "Failed to load sounds");
  const rows = payload.data ?? [];
  catalogMemory = { rows, at: Date.now() };
  return rows;
}

export function invalidateNewsSoundCatalogCache() {
  catalogMemory = null;
}

export function NewsSoundPicker({
  soundId,
  audioUrl = "",
  disabled,
  onSelect,
  organizationId,
  heading = "Soundtrack library",
  hint = "From Sound library (sport_news_sounds). Pick a track — panel stays open until Done.",
}: {
  soundId: string;
  audioUrl?: string;
  disabled?: boolean;
  organizationId?: string | null;
  heading?: string;
  hint?: string;
  onSelect: (
    sound: SportNewsSoundRow | null,
  ) => void | boolean | string | Promise<void | boolean | string>;
}) {
  const [rows, setRows] = useState<SoundtrackCatalogItem[]>(
    () => catalogMemory?.rows ?? [],
  );
  const [loading, setLoading] = useState(!catalogMemory);
  const [refreshing, setRefreshing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async (force = false) => {
    const next = await fetchCatalog(force);
    setRows(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!catalogMemory) setLoading(true);
        else setRefreshing(true);
        await load(false);
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load sounds");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    return () => {
      previewRef.current?.pause();
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind !== "all" && row.kind !== kind) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) || row.kind.toLowerCase().includes(q)
      );
    });
  }, [kind, query, rows]);

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

  const stopPreview = () => {
    previewRef.current?.pause();
    setPreviewPlaying(false);
    setPreviewKey(null);
  };

  const togglePreview = (row: SoundtrackCatalogItem) => {
    const url = toBackendMediaUrl(row.audio_url);
    if (!url) return;
    if (previewKey === row.key && previewPlaying) {
      previewRef.current?.pause();
      setPreviewPlaying(false);
      return;
    }
    if (!previewRef.current) previewRef.current = new Audio();
    const audio = previewRef.current;
    audio.pause();
    audio.src = url;
    audio.currentTime = 0;
    setPreviewKey(row.key);
    void audio.play().then(
      () => setPreviewPlaying(true),
      () => {
        setPreviewPlaying(false);
        setError("Could not play preview.");
      },
    );
    audio.onended = () => {
      setPreviewPlaying(false);
      setPreviewKey(null);
    };
  };

  const pick = async (item: SoundtrackCatalogItem | null) => {
    if (disabled || renaming) return;
    setError(null);
    setEditingKey(null);
    stopPreview();
    if (!item) {
      try {
        await applySelection(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not clear sound");
      }
      return;
    }
    if (!item.sound_id) {
      setError("Add this track in Sound library first.");
      return;
    }
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
  };

  const startRename = (row: SoundtrackCatalogItem) => {
    if (!row.sound_id || disabled) return;
    setEditingKey(row.key);
    setEditName(shortSoundTitle(row.name));
    setError(null);
  };

  const cancelRename = () => {
    setEditingKey(null);
    setEditName("");
  };

  const saveRename = async (row: SoundtrackCatalogItem) => {
    if (!row.sound_id || renaming || disabled) return;
    const next = shortSoundTitle(editName);
    if (!next) {
      setError("Title is required.");
      return;
    }
    setRenaming(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/news-sounds/${row.sound_id}`, { name: next });
      invalidateNewsSoundCatalogCache();
      await load(true);
      if (selectedKey === row.key) {
        await applySelection({
          id: row.sound_id,
          name: next,
          kind: row.kind,
          audio_url: row.audio_url,
          duration_seconds: null,
          sort_order: 0,
          is_active: true,
          created_at: "",
          updated_at: "",
        });
      }
      cancelRename();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename sound");
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-3 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">{heading}</p>
            <p className="text-[11px] leading-snug text-text-secondary">{hint}</p>
          </div>
          <button
            type="button"
            disabled={disabled || loading || refreshing}
            onClick={() => {
              invalidateNewsSoundCatalogCache();
              setRefreshing(true);
              void load(true)
                .catch((err) =>
                  setError(err instanceof Error ? err.message : "Refresh failed"),
                )
                .finally(() => setRefreshing(false));
            }}
            className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-muted disabled:opacity-50"
          >
            {refreshing ? "…" : "Refresh"}
          </button>
        </div>
        {selected ? (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
            <Music2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-medium text-primary">
              Selected · {displaySoundTitle(selected.name, 36)}
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void pick(null)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        ) : null}
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => setPickerOpen(true)}
          className="h-9 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-primary hover:bg-muted disabled:opacity-50"
        >
          Browse media
        </button>
        <select
          value={kind}
          disabled={disabled || loading}
          onChange={(e) => setKind(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-card px-2 text-xs"
        >
          <option value="all">All kinds ({rows.length})</option>
          {NEWS_SOUND_KINDS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        types={["sound"]}
        organizationId={organizationId}
        title="Choose soundtrack"
        onSelect={(item) => {
          if (!item.soundId) {
            setError("That asset is not a library sound yet.");
            return;
          }
          stopPreview();
          void applySelection({
            id: item.soundId,
            name: shortSoundTitle(item.displayName),
            kind: "general",
            audio_url: item.deliveryUrl,
            duration_seconds:
              item.durationSeconds != null ? Math.round(item.durationSeconds) : null,
            sort_order: 0,
            is_active: true,
            created_at: "",
            updated_at: "",
          }).catch((err) =>
            setError(err instanceof Error ? err.message : "Could not select sound"),
          );
        }}
      />

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-hint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled || loading}
          placeholder="Search library…"
          className="h-10 w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {error ? <p className="mb-2 break-words text-xs text-rose-600">{error}</p> : null}

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-10 text-xs text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading library…
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-6 text-center text-xs text-text-secondary">
          No library sounds yet. Upload under Content → Sound library.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-1.5">
          {filtered.map((row) => {
            const active = row.key === selectedKey;
            const label = displaySoundTitle(row.name);
            const editing = editingKey === row.key;
            const meta = newsSoundKindLabel(row.kind);
            const isPreview = previewKey === row.key && previewPlaying;
            if (editing) {
              return (
                <div
                  key={row.key}
                  className="flex min-w-0 items-center gap-1.5 rounded-xl bg-muted/60 px-2 py-1.5"
                >
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={40}
                    disabled={renaming}
                    autoFocus
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveRename(row);
                      }
                      if (e.key === "Escape") cancelRename();
                    }}
                  />
                  <button
                    type="button"
                    disabled={renaming}
                    onClick={() => void saveRename(row)}
                    className="shrink-0 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {renaming ? "…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={renaming}
                    onClick={cancelRename}
                    className="shrink-0 text-xs text-text-secondary hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              );
            }
            return (
              <div
                key={row.key}
                className={cn(
                  "flex w-full min-w-0 items-center gap-1 rounded-xl transition",
                  active ? "bg-primary/10 ring-1 ring-primary/25" : "hover:bg-muted",
                )}
              >
                <button
                  type="button"
                  disabled={disabled || renaming}
                  aria-label={isPreview ? "Pause preview" : "Preview"}
                  onClick={() => togglePreview(row)}
                  className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-text-primary hover:bg-muted/80 disabled:opacity-50"
                >
                  {isPreview ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5 pl-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  disabled={disabled || renaming}
                  title={row.name !== label ? row.name : undefined}
                  onClick={() => void pick(row)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-2.5 text-left text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text-primary">
                      {label}
                    </span>
                    <span className="block truncate text-[11px] text-text-hint">{meta}</span>
                  </span>
                  {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                </button>
                {row.sound_id ? (
                  <button
                    type="button"
                    disabled={disabled || renaming}
                    title="Edit title"
                    onClick={() => startRename(row)}
                    className="mr-1.5 shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-card hover:text-primary disabled:opacity-50"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
