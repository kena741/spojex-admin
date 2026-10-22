"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  NewsMediaFields,
  extractNewsVideoPoster,
  removeNewsVideoWatermark,
  uploadNewsFile,
  type NewsUploadOptions,
  type NewsWatermarkMode,
  type NewsWatermarkPreset,
} from "@/components/news-media-fields";
import { NewsOrgPicker } from "@/components/news-org-picker";
import { NewsSourceField } from "@/components/news-source-field";
import { NewsTikTokPreview } from "@/components/news-tiktok-preview";
import { newsCategories, newsStatusLabel, newsStatuses } from "@/lib/news";
import {
  captureVideoCoverFile,
  resolveNewsStoryMedia,
  type NewsStoryMedia,
  type NewsUploadKind,
} from "@/lib/news-media";
import { adminFetch, deleteAdmin, postAdminResponse } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn, formatDate } from "@/lib/utils";

type EditorTab = "article" | "media" | "publishing" | "insights" | "activity";

type NewsWorkspace = {
  article: Record<string, unknown>;
  organization?: {
    id?: string | null;
    name?: string | null;
    logo_url?: string | null;
    verified?: boolean | null;
  };
  classification?: {
    media_type?: string;
    has_soundtrack?: boolean;
    label?: string;
  };
  display_date?: { label?: string; at?: string | null; first_published_at?: string | null };
  attribution?: {
    publishing_organization?: string | null;
    editorial_author?: string | null;
    original_source?: string | null;
    last_edited_by_admin_id?: string | null;
  };
  insights?: {
    likes?: number;
    comments?: number;
    saves?: number;
    shares?: number;
    basis?: string;
    note?: string;
  };
  activity?: {
    created_at?: string | null;
    updated_at?: string | null;
    published_at?: string | null;
    archived_at?: string | null;
    last_edited_by_admin_id?: string | null;
  };
  allowed_actions?: string[];
  save_mode?: string;
};

type Draft = {
  title: string;
  body: string;
  category: string;
  organization_id: string;
  author: string;
  source: string;
  status: string;
  is_featured: boolean;
  sort_order: number;
  image_url: string;
  cover_url: string;
  image_urls: string[];
  video_url: string;
  audio_url: string;
  sound_id: string;
};

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function galleryFromArticle(article: Record<string, unknown>): string[] {
  const urls = Array.isArray(article.image_urls)
    ? article.image_urls.map((u) => `${u ?? ""}`.trim()).filter(Boolean)
    : [];
  if (urls.length) return [...new Set(urls)];
  const legacy = str(article.image_url || article.cover_url).trim();
  return legacy ? [legacy] : [];
}

function draftFromWorkspace(ws: NewsWorkspace): Draft {
  const a = ws.article || {};
  const gallery = galleryFromArticle(a);
  return {
    title: str(a.title),
    body: str(a.body),
    category: str(a.category) || "General",
    organization_id: str(a.organization_id || ws.organization?.id),
    author: str(a.author),
    source: str(a.source),
    status: str(a.status) || "draft",
    is_featured: Boolean(a.is_featured),
    sort_order: num(a.sort_order),
    image_url: gallery[0] ?? "",
    cover_url: gallery[0] ?? "",
    image_urls: gallery,
    video_url: str(a.video_url),
    audio_url: str(a.audio_url),
    sound_id: str(a.sound_id),
  };
}

const TABS: { id: EditorTab; label: string }[] = [
  { id: "article", label: "Article" },
  { id: "media", label: "Media" },
  { id: "publishing", label: "Publishing" },
  { id: "insights", label: "Insights" },
  { id: "activity", label: "Activity" },
];

export default function NewsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("news:write");

  const [workspace, setWorkspace] = useState<NewsWorkspace | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<EditorTab>("article");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploading, setUploading] = useState<NewsUploadKind | null>(null);
  const [pickedKind, setPickedKind] = useState<NewsStoryMedia | null>(null);
  const [recentSources, setRecentSources] = useState<Array<{ source?: string | null }>>([]);

  const load = useCallback(async () => {
    const res = await adminFetch(`/api/admin/news/${id}/workspace`);
    const json = (await res.json()) as NewsWorkspace & { error?: string };
    if (!res.ok) throw new Error(json.error || "Failed to load article");
    const nextDraft = draftFromWorkspace(json);
    setWorkspace(json);
    setDraft(nextDraft);
    setBaseline(JSON.stringify(nextDraft));
    return json;
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await adminFetch("/api/admin/news?page_size=40&sort=created&order=desc");
        const json = (await res.json()) as { data?: Array<{ source?: string | null }> };
        if (res.ok) setRecentSources(json.data ?? []);
      } catch {
        setRecentSources([]);
      }
    })();
  }, []);

  const dirty = useMemo(() => {
    if (!draft) return false;
    return JSON.stringify(draft) !== baseline;
  }, [baseline, draft]);

  const applyWorkspace = (payload: unknown) => {
    const ws =
      payload && typeof payload === "object" && "workspace" in (payload as object)
        ? ((payload as { workspace: NewsWorkspace }).workspace)
        : (payload as NewsWorkspace);
    if (!ws?.article) return;
    const nextDraft = draftFromWorkspace(ws);
    setWorkspace(ws);
    setDraft(nextDraft);
    setBaseline(JSON.stringify(nextDraft));
  };

  const saveChanges = async (opts?: { quiet?: boolean }) => {
    if (!draft || !canWrite) return false;
    setSaving(true);
    setError(null);
    if (!opts?.quiet) setNotice(null);
    try {
      const patch = {
        title: draft.title.trim(),
        body: draft.body,
        category: draft.category,
        organization_id: draft.organization_id || null,
        author: draft.author,
        source: draft.source.trim(),
        status: draft.status,
        is_featured: draft.is_featured,
        sort_order: draft.sort_order,
        image_urls: draft.image_urls,
        image_url: draft.image_urls[0] ?? "",
        cover_url: draft.image_urls[0] ?? "",
        video_url: draft.video_url,
        audio_url: draft.audio_url,
        sound_id: draft.sound_id || null,
      };
      if (!draft.organization_id.trim()) {
        throw new Error("Publishing organization is required.");
      }
      const payload = await postAdminResponse(`/api/admin/news/${id}/actions`, {
        action: "save",
        patch,
      });
      applyWorkspace(payload);
      if (!opts?.quiet) setNotice("Changes saved.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: string) => {
    if (!canWrite) return;
    if (dirty) {
      const ok = await saveChanges({ quiet: true });
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await postAdminResponse(`/api/admin/news/${id}/actions`, { action });
      applyWorkspace(payload);
      setNotice(
        action === "publish"
          ? "Published."
          : action === "archive"
            ? "Archived. Featured placement cleared; published date preserved."
            : action === "restore_draft"
              ? "Restored to draft."
              : "Updated.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSaving(false);
    }
  };

  const uploadMedia = async (
    file: File,
    kind: NewsUploadKind,
    options?: NewsUploadOptions,
  ) => {
    if (!draft) return;
    setUploading(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "video" && (draft.audio_url.trim() || draft.sound_id.trim())) {
        throw new Error("Remove the audio or soundtrack before uploading video.");
      }
      if (kind === "audio" && draft.video_url.trim()) {
        throw new Error("Remove the video file before uploading audio.");
      }
      const hasCover = draft.image_urls.length > 0 || Boolean(draft.image_url.trim());
      const coverPromise =
        kind === "video" && !hasCover
          ? captureVideoCoverFile(file).catch(() => null)
          : Promise.resolve(null);

      const publicUrl = await uploadNewsFile(id, file, kind, options);
      setDraft((prev) => {
        if (!prev) return prev;
        if (kind === "video") {
          return {
            ...prev,
            video_url: publicUrl,
            audio_url: "",
            sound_id: "",
          };
        }
        if (kind === "audio") {
          return { ...prev, audio_url: publicUrl, sound_id: "" };
        }
        const next = prev.image_urls.includes(publicUrl)
          ? prev.image_urls
          : [...prev.image_urls, publicUrl].slice(0, 10);
        return {
          ...prev,
          image_urls: next,
          image_url: next[0] ?? "",
          cover_url: next[0] ?? "",
        };
      });
      if (kind === "video") {
        setPickedKind("video");
        if (!hasCover) {
          let coverUrl = "";
          const coverFile = await coverPromise;
          if (coverFile) {
            try {
              coverUrl = await uploadNewsFile(id, coverFile, "image");
            } catch {
              coverUrl = "";
            }
          }
          if (!coverUrl) {
            try {
              coverUrl = await extractNewsVideoPoster(id, publicUrl);
            } catch {
              coverUrl = "";
            }
          }
          if (coverUrl) {
            setDraft((prev) =>
              prev
                ? {
                    ...prev,
                    image_urls: [coverUrl],
                    image_url: coverUrl,
                    cover_url: coverUrl,
                  }
                : prev,
            );
          }
        }
      } else if (kind === "audio") {
        setPickedKind("audio");
      }
      setNotice(`${kind === "image" ? "Image" : kind === "video" ? "Video" : "Audio"} added — save to keep.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const removeHard = async () => {
    if (!window.confirm(`Permanently delete "${draft?.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/news/${id}`);
      router.replace("/admin/news");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (loading) return <AdminLoadingRow label="Loading article…" />;
  if (!workspace || !draft) {
    return (
      <div>
        <AdminErrorAlert message={error || "Article not found"} />
        <Link href="/admin/news" className="text-sm font-medium text-primary hover:underline">
          Back to Sport News
        </Link>
      </div>
    );
  }

  const statusLower = draft.status.toLowerCase();
  const isPublished = statusLower === "active" || statusLower === "published";
  const isArchived =
    statusLower === "archived" || statusLower === "archive" || statusLower === "hidden";
  const mediaKind = resolveNewsStoryMedia(draft.video_url, draft.audio_url, pickedKind, {
    imageUrl: draft.image_urls[0] ?? draft.image_url,
    soundId: draft.sound_id,
  });
  const classification = workspace.classification;
  const orgName = workspace.organization?.name || "";

  const PreviewPanel = (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold">Mobile preview</h2>
        <StatusBadge tone={requestTone(draft.status)}>
          {newsStatusLabel(draft.status)}
        </StatusBadge>
      </div>
      <NewsTikTokPreview
        title={draft.title}
        body={draft.body}
        organizationName={orgName}
        source={draft.source}
        imageUrl={draft.image_urls[0] ?? draft.image_url}
        videoUrl={draft.video_url}
        audioUrl={draft.audio_url}
        mediaKind={mediaKind}
        likeCount={num(workspace.insights?.likes)}
        commentCount={num(workspace.insights?.comments)}
        saveCount={num(workspace.insights?.saves)}
        shareCount={num(workspace.insights?.shares)}
      />
      <p className="mt-3 text-center text-xs text-text-hint">
        {classification?.label || "Text"}
        {classification?.has_soundtrack ? " · Soundtrack" : ""}
      </p>
      <p className="mt-1 text-center text-xs text-text-hint">
        {workspace.display_date?.label || "Updated"}{" "}
        {workspace.display_date?.at ? formatDate(workspace.display_date.at) : "—"}
      </p>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-20 -mx-1 mb-4 border-b border-border bg-background/95 px-1 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/news"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to Sport News
          </Link>
          <span
            className={cn(
              "text-xs font-medium",
              dirty ? "text-amber-700" : "text-text-hint",
            )}
          >
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted lg:hidden"
              onClick={() => setPreviewOpen(true)}
            >
              Preview
            </button>
            {canWrite ? (
              <>
                <button
                  type="button"
                  disabled={saving || Boolean(uploading) || !dirty}
                  onClick={() => void saveChanges()}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {saving
                    ? "Saving…"
                    : draft.status === "draft"
                      ? "Save draft"
                      : "Save changes"}
                </button>
                {!isPublished ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void runAction("publish")}
                    className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Publish
                  </button>
                ) : null}
                {!isArchived ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void runAction("archive")}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void runAction("restore_draft")}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Restore draft
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-xs text-text-hint">
          Saves are explicit — edits are not autosaved. Upload media, then Save to persist.
        </p>
      </div>

      <AdminPageHeader
        title={draft.title || "Untitled article"}
        description={`${draft.category} · ${orgName || "No organization"}`}
        breadcrumbs={[
          { label: "Content", href: "/admin/content" },
          { label: "Sport News", href: "/admin/news" },
          { label: draft.title || "Article" },
        ]}
      />

      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              tab === item.id
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary lg:hidden"
          onClick={() => setPreviewOpen(true)}
        >
          Preview
        </button>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          {!canWrite ? (
            <p className="mb-4 text-sm text-text-secondary">Read-only access.</p>
          ) : null}

          {tab === "article" ? (
            <div className="grid gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Headline</span>
                <input
                  value={draft.title}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Description / body</span>
                <textarea
                  value={draft.body}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  rows={10}
                  className="w-full rounded-lg border border-border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Category</span>
                <select
                  value={draft.category}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border px-3"
                >
                  {newsCategories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <NewsOrgPicker
                value={draft.organization_id}
                disabled={!canWrite}
                onChange={(orgId) => setDraft({ ...draft, organization_id: orgId })}
              />
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Editorial author</span>
                <input
                  value={draft.author}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
              <NewsSourceField
                label="Original source"
                optional
                value={draft.source}
                onChange={(next) => setDraft({ ...draft, source: next })}
                knownSources={recentSources}
                disabled={!canWrite}
                inputClassName="h-10 w-full rounded-lg border border-border px-3 text-sm"
                hint="Optional credit under the title on the app."
              />
              <dl className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-text-secondary sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-text-primary">Publishing organization</dt>
                  <dd>{workspace.attribution?.publishing_organization || orgName || "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-primary">Last editor (admin)</dt>
                  <dd>
                    {workspace.attribution?.last_edited_by_admin_id
                      ? String(workspace.attribution.last_edited_by_admin_id).slice(0, 8) + "…"
                      : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          {tab === "media" ? (
            <div className="grid gap-3">
              <p className="text-sm text-text-secondary">
                Primary type:{" "}
                <span className="font-medium text-text-primary">
                  {classification?.label || "Text"}
                </span>
                {classification?.has_soundtrack ? (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                    Soundtrack
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-text-hint">
                An image or gallery with background music stays Image/Gallery — not Audio.
              </p>
              <NewsMediaFields
                articleId={id}
                imageUrl={draft.image_urls[0] ?? draft.image_url}
                imageUrls={draft.image_urls}
                videoUrl={draft.video_url}
                audioUrl={draft.audio_url}
                soundId={draft.sound_id}
                pickedKind={pickedKind}
                uploading={uploading}
                disabled={!canWrite}
                onKind={setPickedKind}
                onUpload={(file, kind, options) => void uploadMedia(file, kind, options)}
                onRemoveImage={() =>
                  setDraft({
                    ...draft,
                    image_url: "",
                    cover_url: "",
                    image_urls: [],
                    ...(draft.sound_id ? { sound_id: "", audio_url: "" } : {}),
                  })
                }
                onRemoveImageAt={(index) => {
                  const next = draft.image_urls.filter((_, i) => i !== index);
                  setDraft({
                    ...draft,
                    image_urls: next,
                    image_url: next[0] ?? "",
                    cover_url: next[0] ?? "",
                    ...(next.length === 0 && draft.sound_id
                      ? { sound_id: "", audio_url: "" }
                      : {}),
                  });
                }}
                onRemoveVideo={() => {
                  setDraft({ ...draft, video_url: "" });
                  setPickedKind("none");
                }}
                onRemoveAudio={() => {
                  setDraft({ ...draft, audio_url: "", sound_id: "" });
                  setPickedKind("none");
                }}
                onRemoveWatermark={(options: {
                  preset: NewsWatermarkPreset;
                  mode: NewsWatermarkMode;
                }) =>
                  void (async () => {
                    if (!draft.video_url.trim()) {
                      setError("Upload a video first.");
                      return;
                    }
                    setUploading("video");
                    try {
                      const publicUrl = await removeNewsVideoWatermark(
                        id,
                        draft.video_url,
                        options,
                      );
                      setDraft({ ...draft, video_url: publicUrl });
                      setPickedKind("video");
                      setNotice("Watermark removed — save to keep.");
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "Watermark removal failed",
                      );
                    } finally {
                      setUploading(null);
                    }
                  })()
                }
                onTrimVideo={(result) => {
                  setDraft({ ...draft, video_url: result.publicUrl });
                  setPickedKind("video");
                  setNotice("Video trimmed — save to keep.");
                }}
                onSoundSelect={(sound) => {
                  if (draft.video_url.trim()) {
                    return "Remove the video before adding an image soundtrack.";
                  }
                  setDraft({
                    ...draft,
                    sound_id: sound?.id ?? "",
                    audio_url: sound?.audio_url?.trim() ?? "",
                  });
                  setPickedKind("none");
                  return true;
                }}
              />
            </div>
          ) : null}

          {tab === "publishing" ? (
            <div className="grid gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Status</span>
                <select
                  value={
                    draft.status === "published" ? "active" : draft.status
                  }
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      status: e.target.value,
                      is_featured:
                        e.target.value === "archived" ? false : draft.is_featured,
                    })
                  }
                  className="h-10 w-full rounded-lg border border-border px-3"
                >
                  {newsStatuses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.is_featured && !isArchived}
                  disabled={!canWrite || isArchived}
                  onChange={(e) => setDraft({ ...draft, is_featured: e.target.checked })}
                />
                Featured on home
                {isArchived ? (
                  <span className="text-xs text-text-hint">(cleared while archived)</span>
                ) : null}
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Sort order</span>
                <input
                  type="number"
                  value={draft.sort_order}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
                  }
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
              <dl className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-text-secondary">First published</dt>
                  <dd className="font-medium">
                    {str(workspace.article.published_at)
                      ? formatDate(str(workspace.article.published_at))
                      : "Not yet"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Archived at</dt>
                  <dd className="font-medium">
                    {str(workspace.article.archived_at)
                      ? formatDate(str(workspace.article.archived_at))
                      : "—"}
                  </dd>
                </div>
              </dl>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => void removeHard()}
                  className="mt-4 justify-self-start rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  Delete permanently
                </button>
              ) : null}
            </div>
          ) : null}

          {tab === "insights" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["Likes", workspace.insights?.likes],
                  ["Comments", workspace.insights?.comments],
                  ["Saves", workspace.insights?.saves],
                  ["Shares", workspace.insights?.shares],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-border bg-muted/30 px-4 py-3"
                >
                  <p className="text-xs text-text-secondary">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? 0}</p>
                </div>
              ))}
              <p className="sm:col-span-2 text-xs text-text-hint">
                {workspace.insights?.note ||
                  "Lifetime engagement from the article row. Period analytics need feed instrumentation."}
              </p>
            </div>
          ) : null}

          {tab === "activity" ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {(
                [
                  ["Created", workspace.activity?.created_at],
                  ["Last updated", workspace.activity?.updated_at],
                  ["First published", workspace.activity?.published_at],
                  ["Archived", workspace.activity?.archived_at],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border px-3 py-2">
                  <dt className="text-xs text-text-secondary">{label}</dt>
                  <dd className="mt-1 font-medium">
                    {value ? formatDate(value) : "—"}
                  </dd>
                </div>
              ))}
              <div className="rounded-lg border border-border px-3 py-2 sm:col-span-2">
                <dt className="text-xs text-text-secondary">Last edited by admin</dt>
                <dd className="mt-1 font-medium">
                  {workspace.activity?.last_edited_by_admin_id || "—"}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>

        <aside className="hidden lg:block">{PreviewPanel}</aside>
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40 lg:hidden">
          <button
            type="button"
            className="flex-1"
            aria-label="Close preview"
            onClick={() => setPreviewOpen(false)}
          />
          <div className="h-full w-full max-w-sm overflow-y-auto bg-background p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-sm font-semibold">Preview</h2>
              <button
                type="button"
                className="text-sm text-primary"
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </button>
            </div>
            {PreviewPanel}
          </div>
        </div>
      ) : null}
    </>
  );
}
