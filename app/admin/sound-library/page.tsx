"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminModal,
  AdminSearchInput,
  AdminTableShell,
} from "@/components/admin-layout";
import { SoundClipEditor } from "@/components/sound-clip-editor";
import { SharedAudioPlayer } from "@/components/shared-audio-player";
import { deleteAdmin, patchAdmin, postAdminResponse } from "@/lib/hooks";
import { newsLibrarySoundAccept, validateLibrarySound } from "@/lib/news-media";
import {
  NEWS_SOUND_KINDS,
  newsSoundKindLabel,
  displaySoundTitle,
  shortSoundTitle,
  type SportNewsSoundRow,
} from "@/lib/news-sounds";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

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
  const canWrite = can("news:write") || can("sounds:write");
  const [rows, setRows] = useState<SportNewsSoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState("all");
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("stadium");
  const [audioUrl, setAudioUrl] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [extractedFromVideo, setExtractedFromVideo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const load = async () => {
    const libRes = await fetch("/api/admin/news-sounds", {
      credentials: "same-origin",
    });
    const libPayload = (await libRes.json()) as {
      data?: SportNewsSoundRow[];
      error?: string;
    };
    if (!libRes.ok) throw new Error(libPayload.error || "Failed to load sounds");
    setRows(libPayload.data ?? []);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filterKind !== "all" && row.kind !== filterKind) return false;
      if (!q) return true;
      return [row.name, row.id, row.kind, row.audio_url]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [filterKind, query, rows]);

  const resetForm = () => {
    setName("");
    setKind("stadium");
    setAudioUrl("");
    setDurationSeconds(null);
    setExtractedFromVideo(false);
  };

  const onUpload = async (file: File) => {
    if (!canWrite) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const uploaded = await uploadLibrarySound(file);
      setAudioUrl(uploaded.publicUrl);
      setDurationSeconds(uploaded.durationSeconds);
      setExtractedFromVideo(uploaded.extractedFromVideo);
      if (!name.trim()) {
        setName(shortSoundTitle(file.name.replace(/\.[^.]+$/, "")));
      }
      setNotice(
        uploaded.extractedFromVideo
          ? "Audio extracted from video. Trim if needed, then add to the library."
          : "Sound uploaded. Trim if needed, then add to the library.",
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
      const result = await postAdminResponse<{
        data?: SportNewsSoundRow;
        created?: boolean;
      }>("/api/admin/news-sounds", {
        name: shortSoundTitle(name),
        kind,
        audio_url: audioUrl.trim(),
        duration_seconds: durationSeconds,
        is_active: true,
        sort_order: rows.length,
      });
      resetForm();
      setUploadOpen(false);
      setNotice(
        result.created === false
          ? "That audio URL is already in the library — reused existing track (names are not merged)."
          : "Sound added to the library.",
      );
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

  const startRename = (row: SportNewsSoundRow) => {
    setEditingId(row.id);
    setEditName(row.name);
    setError(null);
    setNotice(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveRename = async (row: SportNewsSoundRow) => {
    if (!canWrite || renaming) return;
    const next = shortSoundTitle(editName);
    if (!next) {
      setError("Title is required.");
      return;
    }
    setRenaming(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/news-sounds/${row.id}`, { name: next });
      setNotice(`Renamed to “${next}”.`);
      cancelRename();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename sound");
    } finally {
      setRenaming(false);
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
        description="Upload → extract → trim → save. Prefer Media Library for browsing all asset types."
        breadcrumbs={[
          { label: "Content", href: "/admin/content" },
          { label: "Media Library", href: "/admin/media-library?type=sound" },
          { label: "Sounds" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/media-library?type=sound"
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              Open Media Library
            </Link>
            {canWrite ? (
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Upload sound
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

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px]">
        <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name, id, kind…" />
        <select
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
        >
          <option value="all">All kinds</option>
          {NEWS_SOUND_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <AdminModal
        open={uploadOpen}
        onClose={() => {
          if (!saving && !uploading) {
            setUploadOpen(false);
            resetForm();
          }
        }}
        title="Upload to sound library"
      >
        <form
          onSubmit={create}
          className="grid gap-3 md:grid-cols-2"
        >
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="text-text-secondary">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Short title (e.g. Stadium roar)"
              maxLength={48}
              className="h-10 rounded-lg border border-border px-3"
              required
            />
            <span className="text-[11px] text-text-hint">Keep it short — max 48 characters.</span>
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
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="text-text-secondary">
              Audio file or video (extract soundtrack)
            </span>
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
            <span className="text-[11px] text-text-hint">
              MP3 / M4A / WAV (max 20 MB), or MP4 / MOV / WebM video (max 28 MB). Video uploads extract
              audio only — original video is not stored.
            </span>
          </label>
          {audioUrl ? (
            <>
              {extractedFromVideo ? (
                <p className="text-xs text-emerald-700 md:col-span-2">
                  Soundtrack extracted from video.
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
                  setNotice("Clip trimmed. Preview it, then add to the library.");
                }}
              />
            </>
          ) : (
            <p className="text-xs text-text-secondary md:col-span-2">
              After upload you can trim start/end, then save. Same audio URL will not create a
              duplicate library row.
            </p>
          )}
          <div className="md:col-span-2 flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setUploadOpen(false);
                resetForm();
              }}
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !audioUrl.trim() || saving || uploading}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {uploading ? "Uploading…" : saving ? "Saving…" : "Save to library"}
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminTableShell>
        {loading ? <AdminLoadingRow label="Loading sounds…" /> : null}
        {!loading && filtered.length === 0 ? (
          <AdminEmpty
            title="No library sounds yet"
            description="Use Upload sound. Duplicate names stay separate — only exact audio URLs are reused."
          />
        ) : null}
        {!loading && filtered.length > 0 ? (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Preview</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/70">
                  <td className="px-3 py-3 font-medium">
                    {editingId === row.id ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={48}
                          disabled={renaming}
                          className="h-8 min-w-[10rem] flex-1 rounded-md border border-border px-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={renaming}
                          onClick={() => void saveRename(row)}
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          {renaming ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          disabled={renaming}
                          onClick={cancelRename}
                          className="text-xs font-medium text-text-secondary hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div>
                        <span className="block max-w-[14rem] truncate" title={row.name}>
                          {displaySoundTitle(row.name)}
                        </span>
                        {row.duration_seconds != null ? (
                          <p className="mt-0.5 text-[11px] text-text-hint">
                            {row.duration_seconds}s stored
                          </p>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-text-secondary">
                    {newsSoundKindLabel(row.kind)}
                  </td>
                  <td className="px-3 py-3">
                    {row.audio_url ? (
                      <SharedAudioPlayer
                        src={row.audio_url}
                        storedDurationSeconds={row.duration_seconds}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-text-secondary">
                    {row.created_at ? formatDate(row.created_at) : "—"}
                  </td>
                  <td className="px-3 py-3">{row.is_active ? "Active" : "Hidden"}</td>
                  <td className="px-3 py-3">
                    {canWrite ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startRename(row)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Rename
                        </button>
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
    </>
  );
}
