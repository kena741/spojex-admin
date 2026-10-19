"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState("all");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("stadium");
  const [audioUrl, setAudioUrl] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
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
    if (filterKind === "all") return rows;
    return rows.filter((row) => row.kind === filterKind);
  }, [filterKind, rows]);

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
        setName(shortSoundTitle(file.name));
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
      setNotice(
        result.created === false
          ? "That audio is already in the library — reused existing track."
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
        description="Curated reusable tracks for image posts. Upload here once — news pickers only show this library (no duplicate scrapes from videos)."
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
              audio track is kept. Same file URL will not create a duplicate.
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

      <AdminTableShell>
        {loading ? <AdminLoadingRow label="Loading sounds…" /> : null}
        {!loading && filtered.length === 0 ? (
          <AdminEmpty
            title="No library sounds yet"
            description="Upload a track above. Image posts will only offer sounds from this library."
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
                      <span className="block max-w-[14rem] truncate" title={row.name}>
                        {displaySoundTitle(row.name)}
                      </span>
                    )}
                  </td>
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
