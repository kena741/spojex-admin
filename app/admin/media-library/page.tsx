"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminCardsListToggle,
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminReloadButton,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import type { DirectoryView } from "@/lib/directory-view";
import { SharedAudioPlayer } from "@/components/shared-audio-player";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { SoundClipEditor } from "@/components/sound-clip-editor";
import { AdminModal } from "@/components/admin-layout";
import { adminFetch, postAdminResponse } from "@/lib/hooks";
import {
  formatBytes,
  formatDuration,
  statusLabel,
  type MediaAssetDetail,
  type MediaLibraryAsset,
  type MediaLibraryListResponse,
} from "@/lib/media-library";
import { NEWS_SOUND_KINDS, shortSoundTitle } from "@/lib/news-sounds";
import { newsLibrarySoundAccept, validateLibrarySound } from "@/lib/news-media";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { formatDate } from "@/lib/utils";

type ViewMode = "grid" | "list";

async function uploadLibrarySound(file: File) {
  const invalid = validateLibrarySound(file.type, file.name, file.size);
  if (invalid) throw new Error(invalid);
  const body = new FormData();
  body.set("file", file, file.name);
  const response = await fetch("/api/admin/news-sounds/media", {
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
        extractedFromVideo?: boolean;
        objectId?: string;
      })
    : {};
  if (!response.ok) throw new Error(payload.error || "Upload failed");
  if (!payload.publicUrl) throw new Error("Upload failed. No public URL was returned.");
  return {
    publicUrl: toBackendMediaUrl(payload.publicUrl),
    durationSeconds:
      typeof payload.durationSeconds === "number" ? payload.durationSeconds : null,
    extractedFromVideo: Boolean(payload.extractedFromVideo),
    objectId: payload.objectId ?? null,
  };
}

function MediaLibraryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = can("sounds:write") || can("news:write");
  const canRead = can("sounds:read") || can("news:read");

  // Legacy ?library=sounds → type=sound
  useEffect(() => {
    if (searchParams.get("library") === "sounds") {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("library");
      next.set("type", "sound");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  const typeFilter = searchParams.get("type") || "all";
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "all";
  const soundCategory = searchParams.get("sound_category") || "all";
  const usage = searchParams.get("usage") || "all";
  const dateFrom = searchParams.get("from") || "";
  const dateTo = searchParams.get("to") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const assetId = searchParams.get("asset") || "";
  const viewParam = searchParams.get("view");
  // Prefer cards/list; keep grid as alias for cards.
  const view: ViewMode =
    viewParam === "list"
      ? "list"
      : viewParam === "grid" || viewParam === "cards"
        ? "grid"
        : typeFilter === "sound" || typeFilter === "all"
          ? "list"
          : "grid";
  const layoutView: DirectoryView = view === "grid" ? "cards" : "list";

  const [payload, setPayload] = useState<MediaLibraryListResponse | null>(null);
  const [detail, setDetail] = useState<MediaAssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("stadium");
  const [audioUrl, setAudioUrl] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [extractedFromVideo, setExtractedFromVideo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<
    Array<{ id: string; name: string; status: string; error?: string }>
  >([]);

  const writeParams = useCallback(
    (patch: Record<string, string | null>, opts?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("library");
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      if (opts?.resetPage !== false && !("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (q) params.set("q", q);
      if (status !== "all") params.set("status", status);
      if (soundCategory !== "all") params.set("sound_category", soundCategory);
      if (usage !== "all") params.set("usage", usage);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      params.set("page", String(page));
      params.set("page_size", "40");
      const res = await adminFetch(`/api/admin/media-library?${params}`);
      const data = (await res.json()) as MediaLibraryListResponse;
      if (!res.ok) {
        setPayload(null);
        throw new Error(data.error || "Failed to load media library");
      }
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, q, status, soundCategory, usage, dateFrom, dateTo, page]);

  const loadDetail = useCallback(async (id: string) => {
    const res = await adminFetch(`/api/admin/media-library/${id}`);
    const data = (await res.json()) as MediaAssetDetail;
    if (!res.ok) throw new Error(data.error || "Failed to load asset");
    setDetail(data);
  }, []);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      setError("Insufficient permission to view the Media Library.");
      return;
    }
    void load();
  }, [canRead, load]);

  useEffect(() => {
    if (!assetId) {
      setDetail(null);
      return;
    }
    loadDetail(assetId).catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load asset"),
    );
  }, [assetId, loadDetail]);

  const runBackfill = async () => {
    setBusy(true);
    setError(null);
    try {
      await postAdminResponse("/api/admin/media-library/backfill", {});
      setNotice("Index refreshed from sounds and news media objects.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backfill failed");
    } finally {
      setBusy(false);
    }
  };

  const assetAction = async (id: string, action: string, patch?: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await postAdminResponse(`/api/admin/media-library/${id}/actions`, { action, patch });
      await load();
      if (assetId === id) await loadDetail(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const resetUpload = () => {
    setName("");
    setKind("stadium");
    setAudioUrl("");
    setDurationSeconds(null);
    setExtractedFromVideo(false);
    setUploadQueue([]);
  };

  const onUploadFiles = async (files: FileList | File[]) => {
    if (!canWrite) return;
    const list = Array.from(files);
    for (const file of list) {
      const qid = `${file.name}-${file.size}-${Date.now()}`;
      setUploadQueue((prev) => [...prev, { id: qid, name: file.name, status: "uploading" }]);
      setUploading(true);
      try {
        const uploaded = await uploadLibrarySound(file);
        setAudioUrl(uploaded.publicUrl);
        setDurationSeconds(uploaded.durationSeconds);
        setExtractedFromVideo(uploaded.extractedFromVideo);
        if (!name.trim()) setName(shortSoundTitle(file.name.replace(/\.[^.]+$/, "")));
        setUploadQueue((prev) =>
          prev.map((row) =>
            row.id === qid ? { ...row, status: "ready" } : row,
          ),
        );
        setNotice(
          uploaded.extractedFromVideo
            ? "Audio extracted - source video is not retained. Trim if needed, then save."
            : "Uploaded. Trim if needed, then save to the library.",
        );
      } catch (err) {
        setUploadQueue((prev) =>
          prev.map((row) =>
            row.id === qid
              ? {
                  ...row,
                  status: "failed",
                  error: err instanceof Error ? err.message : "Failed",
                }
              : row,
          ),
        );
      }
    }
    setUploading(false);
  };

  const saveSound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || !audioUrl.trim() || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await postAdminResponse("/api/admin/news-sounds", {
        name: shortSoundTitle(name),
        kind,
        audio_url: audioUrl,
        duration_seconds: durationSeconds,
        is_active: true,
      });
      const sound = (res as { data?: { id?: string } }).data;
      if (sound?.id) {
        try {
          await postAdminResponse("/api/admin/media-library/register", {
            media_type: "sound",
            display_name: shortSoundTitle(name),
            delivery_url: audioUrl,
            sound_id: sound.id,
            duration_seconds: durationSeconds,
            sound_category: kind,
          });
        } catch {
          /* registry optional until migrate */
        }
      }
      setUploadOpen(false);
      resetUpload();
      setNotice("Sound saved to the library.");
      writeParams({ type: "sound" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const assets = payload?.assets ?? [];
  const counts = payload?.counts;

  if (!canRead) {
    return (
      <>
        <AdminPageHeader
          title="Media Library"
          breadcrumbs={[
            { label: "Content", href: "/admin/content" },
            { label: "Media Library" },
          ]}
        />
        <AdminErrorAlert message="Insufficient permission to view the Media Library." />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Media Library"
        description="Find, preview, and reuse sounds, images, and videos. Storage stays in the existing media pipeline."
        breadcrumbs={[
          { label: "Content", href: "/admin/content" },
          { label: "Media Library" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton loading={loading} onClick={() => void load()} />
            {canWrite ? (
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Upload
              </button>
            ) : null}
            {canWrite ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runBackfill()}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Refresh index
              </button>
            ) : null}
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-text-secondary">
          {notice}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "All", counts?.all],
            ["image", "Images", counts?.image],
            ["video", "Videos", counts?.video],
            ["sound", "Sounds", counts?.sound],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() =>
              writeParams({
                type: id === "all" ? null : id,
                view: id === "sound" ? "list" : id === "all" ? null : "grid",
              })
            }
            className={
              typeFilter === id
                ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-full border border-border bg-card px-3 py-1.5 text-sm"
            }
          >
            {label}
            {count != null ? ` (${count})` : ""}
          </button>
        ))}
        <AdminCardsListToggle
          className="ml-auto"
          value={layoutView}
          onChange={(next) =>
            writeParams(
              { view: next === "cards" ? "grid" : "list" },
              { resetPage: false },
            )
          }
        />
      </div>

      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <AdminSearchInput
              value={q}
              onChange={(v) => writeParams({ q: v || null })}
              placeholder="Search name, category, or organization"
            />
          </div>
          <AdminSelect
            value={status}
            onChange={(v) => writeParams({ status: v === "all" ? null : v })}
          >
            <option value="all">All statuses</option>
            <option value="ready">Ready</option>
            <option value="hidden">Hidden</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </AdminSelect>
          {(typeFilter === "sound" || typeFilter === "all") && (
            <AdminSelect
              value={soundCategory}
              onChange={(v) => writeParams({ sound_category: v === "all" ? null : v })}
            >
              <option value="all">All categories</option>
              {NEWS_SOUND_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </AdminSelect>
          )}
          <AdminSelect
            value={usage}
            onChange={(v) => writeParams({ usage: v === "all" ? null : v })}
          >
            <option value="all">Any usage</option>
            <option value="used">Used</option>
            <option value="unused">Unused sounds</option>
          </AdminSelect>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => writeParams({ from: e.target.value || null })}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => writeParams({ to: e.target.value || null })}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          />
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() =>
              writeParams({
                q: null,
                status: null,
                sound_category: null,
                usage: null,
                from: null,
                to: null,
              })
            }
          >
            Clear filters
          </button>
          <Link href="/admin/sound-library" className="text-text-secondary hover:underline">
            Classic sound library
          </Link>
        </div>
        {payload?.usage_note ? (
          <p className="mt-2 text-xs text-text-hint">{payload.usage_note}</p>
        ) : null}
      </AdminFilterPanel>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          {loading ? (
            <AdminTableShell>
              <AdminLoadingRow label="Loading media…" compact className="py-10" />
            </AdminTableShell>
          ) : null}
          {!loading && assets.length === 0 ? (
            <AdminEmpty
              title={
                q || status !== "all" || soundCategory !== "all"
                  ? "No results for these filters"
                  : "No media indexed yet"
              }
              description={
                canWrite
                  ? "Upload a sound, or run Refresh index to catalog existing sounds and news media objects."
                  : "Ask an editor to upload or refresh the media index."
              }
            />
          ) : null}

          {!loading && assets.length > 0 && view === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {assets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => writeParams({ asset: a.id }, { resetPage: false })}
                  className={`overflow-hidden rounded-xl border text-left transition-shadow hover:shadow-md ${
                    assetId === a.id ? "border-primary" : "border-border bg-card"
                  }`}
                >
                  <div className="aspect-video bg-muted">
                    {a.media_type === "image" || a.media_type === "video" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={toBackendMediaUrl(a.delivery_url)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-text-secondary">
                        Sound
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="truncate text-sm font-medium">{a.display_name}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                      <StatusBadge tone={requestTone(a.status)}>{statusLabel(a.status)}</StatusBadge>
                      <span>{a.media_type}</span>
                      {a.duration_seconds != null ? (
                        <span>{formatDuration(a.duration_seconds)}</span>
                      ) : null}
                      <span>{a.usage_count} uses</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {!loading && assets.length > 0 && view === "list" ? (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {assets.map((a: MediaLibraryAsset) => (
                <li
                  key={a.id}
                  className={`flex flex-wrap items-start gap-3 px-4 py-3 ${
                    assetId === a.id ? "bg-primary/5" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => writeParams({ asset: a.id }, { resetPage: false })}
                  >
                    <div className="truncate font-medium">{a.display_name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-text-secondary">
                      <span className="capitalize">{a.media_type}</span>
                      {a.sound_category ? <span>{a.sound_category}</span> : null}
                      {a.organization_name ? <span>{a.organization_name}</span> : null}
                      <span>{a.created_at ? formatDate(a.created_at) : ""}</span>
                      <span>
                        {a.usage_count} use{a.usage_count === 1 ? "" : "s"}
                      </span>
                      <StatusBadge tone={requestTone(a.status)}>
                        {statusLabel(a.status)}
                      </StatusBadge>
                    </div>
                  </button>
                  {a.media_type === "sound" && a.delivery_url ? (
                    <SharedAudioPlayer
                      src={a.delivery_url}
                      storedDurationSeconds={a.duration_seconds}
                    />
                  ) : a.duration_seconds != null ? (
                    <span className="text-xs text-text-secondary">
                      {formatDuration(a.duration_seconds)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {payload && payload.total > payload.page_size ? (
            <div className="mt-3 flex items-center justify-between text-sm">
              <button
                type="button"
                disabled={page <= 1}
                className="text-primary disabled:opacity-40"
                onClick={() => writeParams({ page: String(page - 1) }, { resetPage: false })}
              >
                Previous
              </button>
              <span className="text-text-secondary">
                {payload.total} result{payload.total === 1 ? "" : "s"} · page {page}
              </span>
              <button
                type="button"
                disabled={!payload.has_more}
                className="text-primary disabled:opacity-40"
                onClick={() => writeParams({ page: String(page + 1) }, { resetPage: false })}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>

        <aside className="rounded-xl border border-border bg-card p-4">
          {!detail ? (
            <p className="text-sm text-text-secondary">
              Select an asset to preview details, usage, and actions.
            </p>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                {detail.asset.media_type === "sound" ? (
                  <SharedAudioPlayer
                    src={detail.asset.delivery_url}
                    storedDurationSeconds={detail.asset.duration_seconds}
                  />
                ) : detail.asset.media_type === "video" ? (
                  <video
                    src={toBackendMediaUrl(detail.asset.delivery_url)}
                    controls
                    className="w-full rounded-lg bg-black"
                    preload="metadata"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={toBackendMediaUrl(detail.asset.delivery_url)}
                    alt=""
                    className="w-full rounded-lg object-contain bg-muted"
                  />
                )}
              </div>
              <div>
                <div className="font-medium">{detail.asset.display_name}</div>
                <div className="text-xs text-text-secondary">
                  {detail.asset.media_type}
                  {detail.asset.sound_category ? ` · ${detail.asset.sound_category}` : ""}
                </div>
                <StatusBadge tone={requestTone(detail.asset.status)}>
                  {statusLabel(detail.asset.status)}
                </StatusBadge>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-text-secondary">Duration</dt>
                  <dd>{formatDuration(detail.asset.duration_seconds)}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Size</dt>
                  <dd>{formatBytes(detail.asset.byte_size)}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Organization</dt>
                  <dd>{detail.asset.organization_name || "-"}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Uploaded</dt>
                  <dd>
                    {detail.asset.created_at ? formatDate(detail.asset.created_at) : "-"}
                  </dd>
                </div>
              </dl>

              <div>
                <div className="mb-1 text-xs uppercase text-text-secondary">Usage</div>
                {detail.usage_state === "used" ? (
                  <ul className="space-y-1">
                    {detail.usages.map((u) => (
                      <li key={u.id}>
                        {u.href ? (
                          <Link href={u.href} className="text-primary hover:underline">
                            {u.label || u.entity_type}
                          </Link>
                        ) : (
                          <span>{u.label || u.entity_type}</span>
                        )}
                        <span className="text-text-hint"> · {u.field_name}</span>
                      </li>
                    ))}
                  </ul>
                ) : detail.usage_state === "not_used" ? (
                  <p className="text-text-secondary">Not used</p>
                ) : (
                  <p className="text-text-secondary">
                    Usage information unavailable (partial index for images/videos).
                  </p>
                )}
              </div>

              <details className="text-xs text-text-secondary">
                <summary className="cursor-pointer">Technical details</summary>
                <p className="mt-1 break-all">ID: {detail.asset.id}</p>
                <p className="break-all">Key: {detail.technical.storage_key}</p>
                <p>{detail.technical.mime_type || "-"}</p>
              </details>

              {canWrite ? (
                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40"
                    onClick={() => {
                      const next = window.prompt("Display name", detail.asset.display_name);
                      if (next?.trim()) {
                        void assetAction(detail.asset.id, "rename", {
                          display_name: next.trim(),
                        });
                      }
                    }}
                  >
                    Rename
                  </button>
                  {detail.asset.status === "hidden" ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40"
                      onClick={() => void assetAction(detail.asset.id, "restore")}
                    >
                      Restore to selection
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40"
                      onClick={() => void assetAction(detail.asset.id, "hide")}
                    >
                      Hide from new selection
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-red-200 px-3 py-2 text-left text-red-700 hover:bg-red-50"
                    onClick={() => {
                      const msg =
                        detail.usage_state === "used"
                          ? `This asset has ${detail.usages.length} usage(s). Move to trash anyway? Storage is retained.`
                          : "Move to trash? Storage is retained while references may exist.";
                      if (window.confirm(msg)) {
                        void assetAction(detail.asset.id, "trash", {
                          force: detail.usage_state === "used",
                        });
                      }
                    }}
                  >
                    Move to trash
                  </button>
                  {detail.asset.delivery_url ? (
                    <a
                      href={toBackendMediaUrl(detail.asset.delivery_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40"
                    >
                      Open / download
                    </a>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                className="text-xs text-text-secondary hover:underline"
                onClick={() => writeParams({ asset: null }, { resetPage: false })}
              >
                Close panel
              </button>
            </div>
          )}
        </aside>
      </div>

      <AdminModal
        open={uploadOpen}
        onClose={() => {
          if (!saving && !uploading) {
            setUploadOpen(false);
            resetUpload();
          }
        }}
        title="Upload to Media Library"
      >
        <form onSubmit={saveSound} className="grid gap-3">
          <p className="text-xs text-text-secondary">
            Sounds: upload audio, or a short video to extract the soundtrack. Source video is not
            retained. Images and videos for articles can also be uploaded from Add News - run Refresh
            index to catalog them here.
          </p>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={48}
              className="h-10 rounded-lg border border-border px-3"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Category</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="h-10 rounded-lg border border-border px-3"
            >
              {NEWS_SOUND_KINDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div
            className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) void onUploadFiles(e.dataTransfer.files);
            }}
          >
            <p className="text-text-secondary">Drag and drop audio or video here</p>
            <input
              type="file"
              accept={newsLibrarySoundAccept}
              multiple
              disabled={uploading || saving}
              className="mt-3 block w-full text-sm"
              onChange={(e) => {
                const files = e.target.files;
                e.target.value = "";
                if (files?.length) void onUploadFiles(files);
              }}
            />
            <p className="mt-2 text-[11px] text-text-hint">
              MP3 / M4A / WAV (max 20 MB), or MP4 / MOV / WebM (max 28 MB) for audio extraction.
            </p>
          </div>
          {uploadQueue.length ? (
            <ul className="space-y-1 text-xs">
              {uploadQueue.map((row) => (
                <li key={row.id} className="flex justify-between gap-2">
                  <span className="truncate">{row.name}</span>
                  <span className={row.status === "failed" ? "text-red-600" : "text-text-secondary"}>
                    {row.error || row.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {audioUrl ? (
            <>
              {extractedFromVideo ? (
                <p className="text-xs text-emerald-700">
                  Soundtrack extracted. Only audio will be saved.
                </p>
              ) : null}
              <SoundClipEditor
                audioUrl={audioUrl}
                durationSeconds={durationSeconds}
                disabled={uploading || saving}
                onDuration={(seconds) => setDurationSeconds(seconds)}
                onTrimmed={(result) => {
                  setAudioUrl(result.publicUrl);
                  setDurationSeconds(result.durationSeconds);
                  setExtractedFromVideo(false);
                }}
              />
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm"
              onClick={() => {
                setUploadOpen(false);
                resetUpload();
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !audioUrl.trim() || saving || uploading}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save sound"}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}

export default function MediaLibraryPageBoundary() {
  return (
    <Suspense>
      <MediaLibraryPage />
    </Suspense>
  );
}
