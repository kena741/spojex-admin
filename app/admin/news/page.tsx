"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminSearchInput,
  AdminSelect,
  AdminTableActions,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  NewsMediaFields,
  removeNewsVideoWatermark,
  uploadNewsFile,
  type NewsUploadOptions,
  type NewsWatermarkMode,
  type NewsWatermarkPreset,
} from "@/components/news-media-fields";
import { NewsOrgPicker } from "@/components/news-org-picker";
import { NewsSourceField } from "@/components/news-source-field";
import { NewsTikTokPreview } from "@/components/news-tiktok-preview";
import { newsCategories, newsRecency, newsStatusLabel, newsStatuses } from "@/lib/news";
import { rememberNewsSource } from "@/lib/news-sources";
import {
  captureVideoCoverFile,
  resolveNewsStoryMedia,
  type NewsStoryMedia,
  type NewsUploadKind,
} from "@/lib/news-media";
import { deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { SportNewsRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type NewsDraft = {
  title: string;
  category: string;
  status: string;
};

export default function NewsPage() {
  const { can, staff } = useAdminPermissions();
  const canWrite = can("news:write");
  const authorName = staff?.full_name?.trim() || staff?.email?.trim() || "";
  const [rows, setRows] = useState<SportNewsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [soundId, setSoundId] = useState("");
  const [pickedKind, setPickedKind] = useState<NewsStoryMedia | null>("none");
  const [uploading, setUploading] = useState<NewsUploadKind | null>(null);
  const [statusValue, setStatusValue] = useState("draft");
  const [featured, setFeatured] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewsDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error: loadError } = await getSpojexClient()
      .from("sport_news")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (loadError) throw loadError;
    setRows((data ?? []) as SportNewsRow[]);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (status !== "all" && row.status !== status) return false;
        if (!q) return true;
        return [row.title, row.slug, row.body, row.category, row.source]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      .sort((a, b) => newsRecency(b) - newsRecency(a));
  }, [query, rows, status]);

  const resetCreate = () => {
    setTitle("");
    setBody("");
    setSource("");
    setOrganizationId("");
    setOrganizationName("");
    setImageUrl("");
    setImageUrls([]);
    setVideoUrl("");
    setAudioUrl("");
    setSoundId("");
    setPickedKind("none");
    setCategory("General");
    setStatusValue("draft");
    setFeatured(false);
  };

  const uploadMedia = async (
    file: File,
    kind: NewsUploadKind,
    options?: NewsUploadOptions,
  ) => {
    if (kind === "video" && (audioUrl.trim() || soundId.trim())) {
      setError("Remove the audio or soundtrack before uploading video.");
      return;
    }
    if (kind === "audio" && videoUrl.trim()) {
      setError("Remove the video file before uploading audio.");
      return;
    }
    setUploading(kind);
    setError(null);
    try {
      const needsAutoCover =
        kind === "video" && imageUrls.length === 0 && !imageUrl.trim();
      // Capture from the local file before upload so we avoid CORS-tainted canvas.
      const coverPromise = needsAutoCover
        ? captureVideoCoverFile(file).catch(() => null)
        : Promise.resolve(null);

      const publicUrl = await uploadNewsFile(null, file, kind, options);
      if (kind === "image") {
        setImageUrls((prev) => {
          const next = prev.includes(publicUrl) ? prev : [...prev, publicUrl].slice(0, 10);
          setImageUrl(next[0] ?? "");
          return next;
        });
      }
      if (kind === "video") {
        setVideoUrl(publicUrl);
        setSoundId("");
        setAudioUrl("");
        setPickedKind("video");
        const coverFile = await coverPromise;
        if (coverFile && imageUrls.length === 0 && !imageUrl.trim()) {
          try {
            const coverUrl = await uploadNewsFile(null, coverFile, "image");
            setImageUrls([coverUrl]);
            setImageUrl(coverUrl);
          } catch {
            // Non-fatal: list can still show placeholder until a cover is added.
          }
        }
      }
      if (kind === "audio") {
        setAudioUrl(publicUrl);
        setSoundId("");
        setPickedKind("audio");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const removeWatermark = async (options: {
    preset: NewsWatermarkPreset;
    mode: NewsWatermarkMode;
  }) => {
    if (!videoUrl.trim()) {
      setError("Upload a video first.");
      return;
    }
    setUploading("video");
    setError(null);
    try {
      const publicUrl = await removeNewsVideoWatermark(null, videoUrl, options);
      setVideoUrl(publicUrl);
      setPickedKind("video");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Watermark removal failed");
    } finally {
      setUploading(null);
    }
  };

  const trimVideo = async (result: {
    publicUrl: string;
    durationSeconds: number | null;
  }) => {
    setVideoUrl(result.publicUrl);
    setPickedKind("video");
  };

  const create = async () => {
    if (!canWrite || !title.trim() || uploading) return;
    if (!organizationId.trim()) {
      setError("Publishing organization is required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const gallery =
        imageUrls.length > 0
          ? imageUrls
          : imageUrl.trim()
            ? [imageUrl.trim()]
            : [];
      const image = gallery[0] ?? "";
      const sourceLabel = source.trim();
      await postAdmin("/api/admin/news", {
        title: title.trim(),
        category,
        status: statusValue,
        summary: "",
        body: body.trim(),
        source: sourceLabel,
        organization_id: organizationId.trim(),
        image_url: image,
        cover_url: image,
        image_urls: gallery,
        video_url: videoUrl.trim(),
        audio_url: audioUrl.trim(),
        sound_id: soundId.trim() || null,
        is_featured: featured,
      });
      if (sourceLabel) rememberNewsSource(sourceLabel);
      resetCreate();
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (row: SportNewsRow) => {
    setEditingId(row.id);
    setDraft({ title: row.title, category: row.category, status: row.status });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    setSaving(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/news/${editingId}`, {
        title: draft.title.trim(),
        category: draft.category,
        status: draft.status,
      });
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: SportNewsRow) => {
    if (!window.confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/news/${row.id}`);
      if (editingId === row.id) cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Sport news"
        description="Articles for the home feed"
        actions={
          canWrite ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Add news
            </button>
          ) : null
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search headline, category, source" />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            {newsStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading articles…" /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty title="No articles" description="Create sport news to show on the home feed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Article</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Featured</th>
                  <th className="px-4 py-3 font-semibold">Published</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isEditing = editingId === row.id && draft;
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            value={draft.title}
                            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                            className="h-9 w-full min-w-[180px] rounded-lg border border-border px-2 text-sm"
                          />
                        ) : (
                          <>
                            <Link href={`/admin/news/${row.id}`} className="font-medium text-text-primary hover:text-primary">
                              {row.title}
                            </Link>
                            <p className="mt-0.5 text-xs text-text-secondary">
                              {row.source}
                              {row.author ? ` · ${row.author}` : ""}
                              {row.video_url?.trim()
                                ? " · Video"
                                : row.audio_url?.trim()
                                  ? " · Audio"
                                  : ""}
                            </p>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={draft.category}
                            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                            className="h-9 rounded-lg border border-border px-2 text-sm"
                          >
                            {newsCategories.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-text-secondary">{row.category}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={draft.status}
                            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                            className="h-9 rounded-lg border border-border px-2 text-sm"
                          >
                            {newsStatuses.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <StatusBadge tone={requestTone(row.status)}>{newsStatusLabel(row.status)}</StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.is_featured ? (
                          <StatusBadge tone="success">Featured</StatusBadge>
                        ) : (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.published_at ? formatDate(row.published_at) : "—"}
                      </td>
                      {canWrite ? (
                        <td className="px-4 py-3">
                          <AdminTableActions
                            canWrite
                            editing={Boolean(isEditing)}
                            saving={saving}
                            onEdit={() => startEdit(row)}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
                            onDelete={() => remove(row)}
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>

      <AdminModal
        open={createOpen}
        title="Add news"
        onClose={() => {
          if (creating || uploading) return;
          setCreateOpen(false);
        }}
        className="max-w-2xl"
        sheet
        footer={
          <AdminModalFooter
            onCancel={() => {
              if (creating || uploading) return;
              setCreateOpen(false);
            }}
            onSave={() => void create()}
            saving={creating || Boolean(uploading)}
            saveLabel="Create article"
          />
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
          className="grid gap-3"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Headline"
            required
            className="h-10 rounded-lg border border-border px-3 text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            >
              {newsCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={statusValue}
              onChange={(e) => setStatusValue(e.target.value)}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            >
              {newsStatuses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Description"
            rows={5}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
          <NewsOrgPicker
            value={organizationId}
            disabled={creating || Boolean(uploading)}
            onChange={(orgId, org) => {
              setOrganizationId(orgId);
              setOrganizationName(org?.name ?? "");
            }}
          />
          <NewsSourceField
            label="Source label"
            optional
            value={source}
            onChange={setSource}
            knownSources={rows}
            disabled={creating || Boolean(uploading)}
            inputClassName="h-10 w-full rounded-lg border border-border px-3 text-sm"
            hint="Optional credit under the title on the app. Leave blank to hide."
          />
          <p className="text-sm text-text-secondary">
            Author{" "}
            <span className="font-medium text-text-primary">{authorName || "Signed-in admin"}</span>
          </p>
          <NewsTikTokPreview
            title={title}
            body={body}
            organizationName={organizationName}
            source={source.trim()}
            imageUrl={imageUrls[0] ?? imageUrl}
            videoUrl={videoUrl}
            audioUrl={audioUrl}
            mediaKind={resolveNewsStoryMedia(videoUrl, audioUrl, pickedKind, {
              imageUrl: imageUrls[0] ?? imageUrl,
              soundId,
            })}
            className="mb-2"
          />
          <NewsMediaFields
            imageUrl={imageUrls[0] ?? imageUrl}
            imageUrls={imageUrls}
            videoUrl={videoUrl}
            audioUrl={audioUrl}
            soundId={soundId}
            pickedKind={pickedKind}
            uploading={uploading}
            onKind={setPickedKind}
            onUpload={(file, kind, options) => void uploadMedia(file, kind, options)}
            onRemoveImage={() => {
              setImageUrl("");
              setImageUrls([]);
              if (soundId) {
                setSoundId("");
                setAudioUrl("");
              }
            }}
            onRemoveImageAt={(index) => {
              setImageUrls((prev) => {
                const next = prev.filter((_, i) => i !== index);
                setImageUrl(next[0] ?? "");
                if (next.length === 0 && soundId) {
                  setSoundId("");
                  setAudioUrl("");
                }
                return next;
              });
            }}
            onRemoveVideo={() => {
              setVideoUrl("");
              setPickedKind("none");
            }}
            onRemoveAudio={() => {
              setAudioUrl("");
              setSoundId("");
              setPickedKind("none");
            }}
            onRemoveWatermark={(options) => void removeWatermark(options)}
            onTrimVideo={(result) => void trimVideo(result)}
            onSoundSelect={(sound) => {
              setSoundId(sound?.id ?? "");
              setAudioUrl(sound?.audio_url?.trim() ?? "");
              setPickedKind("none");
            }}
          />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />
            Feature on home
          </label>
        </form>
      </AdminModal>
    </>
  );
}
