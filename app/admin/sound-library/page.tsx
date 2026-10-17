"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import { deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { newsLibrarySoundAccept, validateLibrarySound } from "@/lib/news-media";
import {
  NEWS_SOUND_KINDS,
  SOUNDTRACK_SOURCE_LABEL,
  newsSoundKindLabel,
  type SoundtrackCatalogItem,
  type SportNewsSoundRow,
} from "@/lib/news-sounds";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { useAdminPermissions } from "@/lib/use-admin-permissions";

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
      })
    : {};
  if (!response.ok) throw new Error(payload.error || "Upload failed");
  if (!payload.publicUrl) throw new Error("Upload failed. No public URL was returned.");
  return {
    publicUrl: toBackendMediaUrl(payload.publicUrl),
    durationSeconds:
      typeof payload.durationSeconds === "number" ? payload.durationSeconds : null,
    extractedFromVideo: Boolean(payload.extractedFromVideo),
  };
}

export default function SoundLibraryPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("news:write");
  const [rows, setRows] = useState<SportNewsSoundRow[]>([]);
  const [catalog, setCatalog] = useState<SoundtrackCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState("all");
  const [catalogSource, setCatalogSource] = useState<"all" | SoundtrackCatalogItem["source"]>(
    "all",
  );
  const [catalogQuery, setCatalogQuery] = useState("");
  const [promotingKey, setPromotingKey] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("stadium");
  const [audioUrl, setAudioUrl] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [libRes, catRes] = await Promise.all([
      fetch("/api/admin/news-sounds", { credentials: "same-origin" }),
      fetch("/api/admin/news-sounds/catalog", { credentials: "same-origin" }),
    ]);
    const libPayload = (await libRes.json()) as {
      data?: SportNewsSoundRow[];
      error?: string;
    };
    if (!libRes.ok) throw new Error(libPayload.error || "Failed to load sounds");
    setRows(libPayload.data ?? []);

    const catPayload = (await catRes.json()) as {
      data?: SoundtrackCatalogItem[];
      error?: string;
    };
    if (catRes.ok) {
      setCatalog(catPayload.data ?? []);
    }
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filterKind === "all") return rows;
    return rows.filter((row) => row.kind === filterKind);
  }, [filterKind, rows]);

  const catalogFiltered = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    return catalog.filter((row) => {
      if (catalogSource !== "all" && row.source !== catalogSource) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.kind.toLowerCase().includes(q) ||
        SOUNDTRACK_SOURCE_LABEL[row.source].toLowerCase().includes(q)
      );
    });
  }, [catalog, catalogQuery, catalogSource]);

  const promoteToLibrary = async (item: SoundtrackCatalogItem) => {
    if (!canWrite || item.sound_id) return;
    setPromotingKey(item.key);
    setError(null);
    try {
      await postAdmin("/api/admin/news-sounds", {
        name: item.name,
        kind: item.kind || "general",
        audio_url: item.audio_url,
        is_active: true,
        sort_order: rows.length,
      });
      setNotice(`“${item.name}” added to the curated library.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to library");
    } finally {
      setPromotingKey("");
    }
  };

  const resetForm = () => {
    setName("");
    setKind("stadium");
    setAudioUrl("");
    setDurationSeconds(null);
  };

  const onUpload = async (file: File) => {
    if (!canWrite) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadLibrarySound(file);
      setAudioUrl(uploaded.publicUrl);
      setDurationSeconds(uploaded.durationSeconds);
      if (!name.trim()) {
        setName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim());
      }
      setNotice(
        uploaded.extractedFromVideo
          ? "Audio extracted from video. Save to add it to the library."
          : "Sound uploaded. Save to add it to the library.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite || saving || uploading) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await postAdmin("/api/admin/news-sounds", {
        name: name.trim(),
        kind,
        audio_url: audioUrl.trim(),
        duration_seconds: durationSeconds,
        is_active: true,
        sort_order: rows.length,
      });
      resetForm();
      setNotice("Sound added to the library.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sound");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: SportNewsSoundRow) => {
    if (!canWrite) return;
    setError(null);
    try {
      await patchAdmin(`/api/admin/news-sounds/${row.id}`, {
        is_active: !row.is_active,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update sound");
    }
  };

  const remove = async (row: SportNewsSoundRow) => {
    if (!canWrite) return;
    if (!window.confirm(`Delete “${row.name}”? News using it will keep the audio URL.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/news-sounds/${row.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete sound");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Sound library"
        description="TikTok-style reusable Spojex audio: curated library plus every uploaded news/media soundtrack."
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-text-secondary">
          {notice}
        </p>
      ) : null}

      {canWrite ? (
        <form
          onSubmit={create}
          className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2"
        >
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="text-text-secondary">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Stadium roar"
              className="h-10 rounded-lg border border-border px-3"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Kind</span>
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
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Audio or video file</span>
            <input
              type="file"
              accept={newsLibrarySoundAccept}
              disabled={uploading || saving}
              className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void onUpload(file);
              }}
            />
          </label>
          {audioUrl ? (
            <audio
              src={toBackendMediaUrl(audioUrl)}
              controls
              className="w-full md:col-span-2"
            />
          ) : (
            <p className="text-xs text-text-secondary md:col-span-2">
              Upload MP3 / M4A / WAV (max 20 MB), or MP4 / MOV / WebM video (max 28 MB) — only the
              audio track is kept. Different kinds keep the library easy to browse.
            </p>
          )}
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!name.trim() || !audioUrl.trim() || saving || uploading}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : saving ? "Saving…" : "Add to library"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-sm text-text-secondary">Filter</label>
        <select
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value)}
          className="h-9 rounded-lg border border-border px-2 text-sm"
        >
          <option value="all">All kinds</option>
          {NEWS_SOUND_KINDS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <h2 className="mb-2 font-heading text-sm font-semibold">Curated library</h2>
      <AdminTableShell>
        {loading ? <AdminLoadingRow label="Loading sounds…" /> : null}
        {!loading && filtered.length === 0 ? (
          <AdminEmpty
            title="No curated sounds yet"
            description="Upload above, or promote tracks from All Spojex audio below."
          />
        ) : null}
        {!loading && filtered.length > 0 ? (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Preview</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/70">
                  <td className="px-3 py-3 font-medium">{row.name}</td>
                  <td className="px-3 py-3 text-text-secondary">
                    {newsSoundKindLabel(row.kind)}
                  </td>
                  <td className="px-3 py-3">
                    {row.audio_url ? (
                      <audio
                        src={toBackendMediaUrl(row.audio_url)}
                        controls
                        preload="none"
                        className="h-8 max-w-[220px]"
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {row.is_active ? "Active" : "Hidden"}
                  </td>
                  <td className="px-3 py-3">
                    {canWrite ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleActive(row)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {row.is_active ? "Hide" : "Show"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(row)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </AdminTableShell>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-sm font-semibold">All Spojex audio</h2>
            <p className="text-xs text-text-secondary">
              Every reusable upload — library, news tracks, and media objects ({catalog.length}).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Search Spojex audio…"
              className="h-9 w-48 rounded-lg border border-border px-3 text-sm"
            />
            <select
              value={catalogSource}
              onChange={(e) =>
                setCatalogSource(e.target.value as typeof catalogSource)
              }
              className="h-9 rounded-lg border border-border px-2 text-sm"
            >
              <option value="all">All sources</option>
              <option value="library">Library</option>
              <option value="news">News audio</option>
              <option value="media">Uploads</option>
            </select>
          </div>
        </div>
        <AdminTableShell>
          {loading ? <AdminLoadingRow label="Loading Spojex audio…" /> : null}
          {!loading && catalogFiltered.length === 0 ? (
            <AdminEmpty
              title="No Spojex audio found"
              description="Upload sounds above or publish news with audio — they appear here for reuse."
            />
          ) : null}
          {!loading && catalogFiltered.length > 0 ? (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Preview</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {catalogFiltered.map((row) => (
                  <tr key={row.key} className="border-b border-border/70">
                    <td className="px-3 py-3 font-medium">{row.name}</td>
                    <td className="px-3 py-3 text-text-secondary">
                      {SOUNDTRACK_SOURCE_LABEL[row.source]}
                    </td>
                    <td className="px-3 py-3">
                      <audio
                        src={toBackendMediaUrl(row.audio_url)}
                        controls
                        preload="none"
                        className="h-8 max-w-[220px]"
                      />
                    </td>
                    <td className="px-3 py-3">
                      {row.sound_id ? (
                        <span className="text-xs text-text-hint">In library</span>
                      ) : canWrite ? (
                        <button
                          type="button"
                          disabled={promotingKey === row.key}
                          onClick={() => void promoteToLibrary(row)}
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          {promotingKey === row.key ? "Adding…" : "Add to library"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </AdminTableShell>
      </section>
    </>
  );
}
