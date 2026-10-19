"use client";

import { useEffect, useMemo, useState } from "react";
import {
  NEWS_SOUND_KINDS,
  displaySoundTitle,
  newsSoundKindLabel,
  shortSoundTitle,
  type SoundtrackCatalogItem,
  type SportNewsSoundRow,
} from "@/lib/news-sounds";
import { patchAdmin } from "@/lib/hooks";
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
  const [renaming, setRenaming] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
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

  const pick = async (item: SoundtrackCatalogItem | null) => {
    if (disabled || renaming) return;
    setError(null);
    setEditingKey(null);
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
      await load();
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
    <div className="mt-3 min-w-0 overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <div className="mb-2 flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-secondary">Image soundtrack</p>
          <p className="truncate text-[11px] text-text-hint">
            Sound library ({rows.length}) · add tracks under Sound library
          </p>
        </div>
        <select
          value={kind}
          disabled={disabled || loading}
          onChange={(e) => setKind(e.target.value)}
          className="h-8 max-w-[7rem] shrink-0 rounded-md border border-border bg-card px-2 text-xs"
        >
          <option value="all">All kinds</option>
          {NEWS_SOUND_KINDS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled || loading}
        placeholder="Search library…"
        className="mb-2 h-9 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm"
      />

      {error ? <p className="mb-2 break-words text-xs text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-xs text-text-secondary">Loading library…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-text-secondary">
          No library sounds yet. Upload under Admin → Sound library.
        </p>
      ) : (
        <div className="max-h-56 space-y-1 overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            disabled={disabled || renaming}
            onClick={() => void pick(null)}
            className={`flex w-full min-w-0 items-center rounded-md px-2 py-2 text-left text-sm ${
              !selectedKey ? "bg-primary/10 text-primary" : "hover:bg-muted"
            }`}
          >
            <span>No sound</span>
          </button>
          {filtered.map((row) => {
            const active = row.key === selectedKey;
            const label = displaySoundTitle(row.name);
            const editing = editingKey === row.key;
            const meta = newsSoundKindLabel(row.kind);
            if (editing) {
              return (
                <div
                  key={row.key}
                  className="flex min-w-0 items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1.5"
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
                className={`flex w-full min-w-0 items-center gap-1 rounded-md ${
                  active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                <button
                  type="button"
                  disabled={disabled || renaming}
                  title={row.name !== label ? row.name : undefined}
                  onClick={() => void pick(row)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                  <span className="max-w-[5.5rem] shrink-0 truncate text-[11px] text-text-hint" title={meta}>
                    {meta}
                  </span>
                </button>
                {row.sound_id ? (
                  <button
                    type="button"
                    disabled={disabled || renaming}
                    title="Edit title"
                    onClick={() => startRename(row)}
                    className="mr-1 shrink-0 rounded px-1.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-card hover:text-primary disabled:opacity-50"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {selected?.audio_url ? (
        <audio
          key={selected.key}
          src={toBackendMediaUrl(selected.audio_url)}
          controls
          className="mt-2 w-full max-w-full"
        />
      ) : null}
    </div>
  );
}
