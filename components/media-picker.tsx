"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminEmpty, AdminErrorAlert, AdminLoadingRow, AdminSearchInput } from "@/components/admin-layout";
import { SharedAudioPlayer } from "@/components/shared-audio-player";
import {
  formatDuration,
  type MediaLibraryAsset,
  type MediaLibraryListResponse,
} from "@/lib/media-library";
import { toBackendMediaUrl } from "@/lib/spojex-media";

export type MediaPickerSelection = {
  assetId: string;
  soundId: string | null;
  mediaObjectId: string | null;
  deliveryUrl: string;
  displayName: string;
  mediaType: string;
  durationSeconds: number | null;
  /** Soundtrack offset (seconds) — optional. */
  offsetSeconds?: number;
  volume?: number;
};

/**
 * Reusable media picker for Add News and other posting flows.
 * Returns stable asset IDs; upload opens in a new tab so drafts are preserved.
 */
export function MediaPicker({
  open,
  onClose,
  types = ["sound"],
  organizationId,
  multi = false,
  selectedIds = [],
  onSelect,
  onSelectMany,
  title = "Choose media",
}: {
  open: boolean;
  onClose: () => void;
  types?: Array<"image" | "video" | "sound">;
  organizationId?: string | null;
  multi?: boolean;
  selectedIds?: string[];
  onSelect?: (item: MediaPickerSelection) => void;
  onSelectMany?: (items: MediaPickerSelection[]) => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<MediaLibraryAsset[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedIds));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("types", types.join(","));
      if (organizationId) params.set("organization_id", organizationId);
      if (q.trim()) params.set("q", q.trim());
      params.set("page_size", "60");
      const res = await fetch(`/api/admin/media-library/picker?${params}`, {
        credentials: "same-origin",
      });
      const data = (await res.json()) as MediaLibraryListResponse;
      if (!res.ok) throw new Error(data.error || "Failed to load media");
      setAssets(data.assets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [types, organizationId, q]);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set(selectedIds));
    void load();
  }, [open, selectedIds, load]);

  if (!open) return null;

  const toSelection = (a: MediaLibraryAsset): MediaPickerSelection => ({
    assetId: a.id,
    soundId: a.sound_id,
    mediaObjectId: a.media_object_id,
    deliveryUrl: a.delivery_url,
    displayName: a.display_name,
    mediaType: a.media_type,
    durationSeconds: a.duration_seconds,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-medium">{title}</h3>
          <button type="button" className="text-sm text-text-secondary hover:underline" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-3 border-b border-border px-4 py-3">
          <AdminSearchInput value={q} onChange={setQ} placeholder="Search library…" />
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" className="text-primary hover:underline" onClick={() => void load()}>
              Search
            </button>
            <a
              href="/admin/media-library?type=sound"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Upload in Media Library
            </a>
            <span className="text-text-hint">Opens in a new tab so your draft stays open.</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? <AdminErrorAlert message={error} /> : null}
          {loading ? <AdminLoadingRow label="Loading…" /> : null}
          {!loading && assets.length === 0 ? (
            <AdminEmpty
              title="No matching assets"
              description="Upload media in the Media Library, then return here to select."
            />
          ) : null}
          <ul className="divide-y divide-border">
            {assets.map((a) => {
              const isOn = picked.has(a.id);
              return (
                <li key={a.id} className="flex items-start gap-3 py-3">
                  {a.media_type === "image" || a.media_type === "video" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={toBackendMediaUrl(a.delivery_url)}
                      alt=""
                      className="h-14 w-14 rounded-md object-cover bg-muted"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-md bg-muted text-xs text-text-secondary">
                      Audio
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.display_name}</div>
                    <div className="text-xs text-text-secondary">
                      {a.media_type}
                      {a.sound_category ? ` · ${a.sound_category}` : ""}
                      {a.duration_seconds != null
                        ? ` · ${formatDuration(a.duration_seconds)}`
                        : ""}
                    </div>
                    {a.media_type === "sound" && a.delivery_url ? (
                      <SharedAudioPlayer
                        src={a.delivery_url}
                        storedDurationSeconds={a.duration_seconds}
                        className="mt-1"
                      />
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={
                      isOn
                        ? "rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                        : "rounded-md border border-border px-2 py-1 text-xs"
                    }
                    onClick={() => {
                      if (multi) {
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(a.id)) next.delete(a.id);
                          else next.add(a.id);
                          return next;
                        });
                      } else {
                        onSelect?.(toSelection(a));
                        onClose();
                      }
                    }}
                  >
                    {multi ? (isOn ? "Selected" : "Select") : "Select"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {multi ? (
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              onClick={() => {
                const items = assets.filter((a) => picked.has(a.id)).map(toSelection);
                onSelectMany?.(items);
                onClose();
              }}
            >
              Use selected ({picked.size})
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
