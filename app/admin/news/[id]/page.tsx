"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
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
import { newsCategories, newsStatusLabel, newsStatuses } from "@/lib/news";
import {
  captureVideoCoverFile,
  resolveNewsStoryMedia,
  type NewsStoryMedia,
  type NewsUploadKind,
} from "@/lib/news-media";
import { deleteAdmin, patchAdmin } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { SportNewsRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function NewsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("news:write");
  const [article, setArticle] = useState<SportNewsRow | null>(null);
  const [recentSourceRows, setRecentSourceRows] = useState<
    Array<{ source?: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState<NewsUploadKind | null>(null);
  const [pickedKind, setPickedKind] = useState<NewsStoryMedia | null>(null);

  const load = async () => {
    const { data, error: loadError } = await getSpojexClient()
      .from("sport_news")
      .select(
        "*, organizations(id, name, logo_url, user_id, public_id, is_platform, verified)",
      )
      .eq("id", id)
      .maybeSingle();
    if (loadError) {
      const plain = await getSpojexClient()
        .from("sport_news")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (plain.error) throw plain.error;
      setArticle(plain.data as SportNewsRow | null);
      return;
    }
    setArticle(data as SportNewsRow | null);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await getSpojexClient()
          .from("sport_news")
          .select("source")
          .order("created_at", { ascending: false })
          .limit(100);
        setRecentSourceRows((data ?? []) as Array<{ source?: string | null }>);
      } catch {
        setRecentSourceRows([]);
      }
    })();
  }, []);

  const save = async (patch: Record<string, unknown>): Promise<true | string> => {
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(`/api/admin/news/${id}`, patch);
      await load();
      setNotice("Saved.");
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      return message;
    }
  };

  const publish = async () => {
    await save({
      status: "active",
      published_at: new Date().toISOString(),
    });
  };

  const uploadMedia = async (
    file: File,
    kind: NewsUploadKind,
    options?: NewsUploadOptions,
  ) => {
    setUploading(kind);
    setError(null);
    setNotice(null);
    try {
      if (
        kind === "video" &&
        (article?.audio_url?.trim() || article?.sound_id?.trim())
      ) {
        throw new Error("Remove the audio or soundtrack before uploading video.");
      }
      if (kind === "audio" && article?.video_url?.trim()) {
        throw new Error("Remove the video file before uploading audio.");
      }
      const existingGallery = Array.isArray(article?.image_urls)
        ? article!.image_urls!.map((u) => `${u ?? ""}`.trim()).filter(Boolean)
        : [];
      const legacyCover = `${article?.image_url ?? article?.cover_url ?? ""}`.trim();
      const hasCover =
        existingGallery.length > 0 || Boolean(legacyCover);
      const coverPromise =
        kind === "video" && !hasCover
          ? captureVideoCoverFile(file).catch(() => null)
          : Promise.resolve(null);

      const publicUrl = await uploadNewsFile(id, file, kind, options);
      if (kind === "video") {
        const coverFile = await coverPromise;
        let coverUrl = "";
        if (coverFile && !hasCover) {
          try {
            coverUrl = await uploadNewsFile(id, coverFile, "image");
          } catch {
            coverUrl = "";
          }
        }
        const patch: Record<string, unknown> = {
          video_url: publicUrl,
          audio_url: "",
          sound_id: null,
        };
        if (coverUrl) {
          patch.image_urls = [coverUrl];
          patch.image_url = coverUrl;
          patch.cover_url = coverUrl;
        }
        if ((await save(patch)) !== true) {
          return;
        }
        setPickedKind("video");
      } else if (kind === "audio") {
        if ((await save({ audio_url: publicUrl, sound_id: null })) !== true) return;
        setPickedKind("audio");
      } else {
        const existing = Array.isArray(article?.image_urls)
          ? article!.image_urls!.map((u) => `${u ?? ""}`.trim()).filter(Boolean)
          : [];
        const legacy = `${article?.image_url ?? article?.cover_url ?? ""}`.trim();
        const current = existing.length > 0 ? existing : legacy ? [legacy] : [];
        if (current.includes(publicUrl)) {
          setNotice("Image already added.");
          return;
        }
        if (current.length >= 10) {
          throw new Error("You can add up to 10 images.");
        }
        const next = [...current, publicUrl];
        if ((await save({
            image_urls: next,
            image_url: next[0] ?? "",
            cover_url: next[0] ?? "",
          })) !== true) {
          return;
        }
      }
      setNotice(kind === "video" ? "Video added." : kind === "audio" ? "Audio added." : "Image added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const removeImage = async () => {
    const patch: Record<string, unknown> = {
      image_url: "",
      cover_url: "",
      image_urls: [],
    };
    if (article?.sound_id) {
      patch.sound_id = null;
      patch.audio_url = "";
    }
    if ((await save(patch)) !== true) return;
  };

  const removeImageAt = async (index: number) => {
    const existing = Array.isArray(article?.image_urls)
      ? article!.image_urls!.map((u) => `${u ?? ""}`.trim()).filter(Boolean)
      : [];
    const legacy = `${article?.image_url ?? article?.cover_url ?? ""}`.trim();
    const current = existing.length > 0 ? existing : legacy ? [legacy] : [];
    const next = current.filter((_, i) => i !== index);
    const patch: Record<string, unknown> = {
      image_urls: next,
      image_url: next[0] ?? "",
      cover_url: next[0] ?? "",
    };
    if (next.length === 0 && article?.sound_id) {
      patch.sound_id = null;
      patch.audio_url = "";
    }
    if ((await save(patch)) !== true) return;
  };

  const removeVideo = async () => {
    if ((await save({ video_url: "" })) !== true) return;
    setPickedKind("none");
  };

  const removeAudio = async () => {
    if ((await save({ audio_url: "", sound_id: null })) !== true) return;
    setPickedKind("none");
  };

  const removeWatermark = async (options: {
    preset: NewsWatermarkPreset;
    mode: NewsWatermarkMode;
  }) => {
    const source = article?.video_url?.trim() || "";
    if (!source) {
      setError("Upload a video first.");
      return;
    }
    setUploading("video");
    setError(null);
    setNotice(null);
    try {
      const publicUrl = await removeNewsVideoWatermark(id, source, options);
      if ((await save({ video_url: publicUrl })) !== true) return;
      setPickedKind("video");
      setNotice("Watermark removed.");
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
    setError(null);
    setNotice(null);
    if ((await save({ video_url: result.publicUrl })) !== true) return;
    setPickedKind("video");
    setNotice("Video trimmed.");
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${article?.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/news/${id}`);
      router.replace("/admin/news");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (loading) return <AdminLoadingRow label="Loading article…" />;
  if (!article) return <AdminErrorAlert message={error || "Article not found"} />;

  const gallery = (
    Array.isArray(article.image_urls) && article.image_urls.length > 0
      ? article.image_urls
      : [article.image_url, article.cover_url]
  )
    .map((u) => `${u ?? ""}`.trim())
    .filter(Boolean)
    .filter((url, i, arr) => arr.indexOf(url) === i);
  const image = gallery[0] ?? "";
  const soundId = article.sound_id?.trim() || "";
  const mediaKind = resolveNewsStoryMedia(
    article.video_url ?? "",
    article.audio_url ?? "",
    pickedKind,
    { imageUrl: image, soundId },
  );
  const orgLabel = article.organizations?.name || article.source;

  return (
    <>
      <AdminPageHeader
        title={article.title}
        description={`${article.category} · ${orgLabel}`}
        backHref="/admin/news"
        breadcrumbs={[
          { label: "Sport news", href: "/admin/news" },
          { label: article.title },
        ]}
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              {article.status !== "active" ? (
                <button
                  type="button"
                  onClick={publish}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Publish
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => save({ is_featured: !article.is_featured })}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                {article.is_featured ? "Unfeature" : "Feature on home"}
              </button>
              <button
                type="button"
                onClick={remove}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          ) : null
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-heading text-sm font-semibold">Preview</h2>
            <StatusBadge tone={requestTone(article.status)}>
              {newsStatusLabel(article.status)}
            </StatusBadge>
          </div>
          <NewsTikTokPreview
            title={article.title}
            body={article.body}
            organizationName={article.organizations?.name ?? ""}
            source={article.source ?? ""}
            imageUrl={image}
            videoUrl={article.video_url ?? ""}
            audioUrl={article.audio_url ?? ""}
            mediaKind={mediaKind}
            likeCount={Number(article.like_count ?? 0)}
            commentCount={Number(article.comment_count ?? 0)}
            saveCount={Number(article.save_count ?? 0)}
            shareCount={Number(article.share_count ?? 0)}
          />
          <p className="mt-4 text-center text-xs text-text-hint">
            Published {article.published_at ? formatDate(article.published_at) : "not yet"}
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-heading text-sm font-semibold">Edit article</h2>
          {!canWrite ? (
            <p className="text-sm text-text-secondary">Read-only access.</p>
          ) : (
            <div className="grid gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Headline</span>
                <input
                  defaultValue={article.title}
                  onBlur={(e) => {
                    if (e.target.value !== article.title) save({ title: e.target.value });
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Description</span>
                <textarea
                  defaultValue={article.body}
                  onBlur={(e) => {
                    if (e.target.value !== article.body) save({ body: e.target.value });
                  }}
                  rows={8}
                  className="w-full rounded-lg border border-border px-3 py-2"
                />
              </label>
              <NewsOrgPicker
                value={article.organization_id ?? ""}
                disabled={!canWrite}
                onChange={(orgId) => {
                  if (orgId !== (article.organization_id ?? "")) {
                    void save({ organization_id: orgId || null });
                  }
                }}
              />
              <NewsMediaFields
                articleId={id}
                imageUrl={image}
                imageUrls={gallery}
                videoUrl={article.video_url ?? ""}
                audioUrl={article.audio_url ?? ""}
                soundId={soundId}
                pickedKind={pickedKind}
                uploading={uploading}
                disabled={!canWrite}
                onKind={setPickedKind}
                onUpload={(file, kind, options) => void uploadMedia(file, kind, options)}
                onRemoveImage={() => void removeImage()}
                onRemoveImageAt={(index) => void removeImageAt(index)}
                onRemoveVideo={() => void removeVideo()}
                onRemoveAudio={() => void removeAudio()}
                onRemoveWatermark={(options) => void removeWatermark(options)}
                onTrimVideo={(result) => void trimVideo(result)}
                onSoundSelect={async (sound) => {
                  if (article.video_url?.trim()) {
                    return "Remove the video before adding an image soundtrack.";
                  }
                  const result = await save({
                    sound_id: sound?.id ?? null,
                    audio_url: sound?.audio_url?.trim() ?? "",
                  });
                  if (result !== true) return result;
                  setPickedKind("none");
                  return true;
                }}
              />
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Category</span>
                <select
                  value={article.category}
                  onChange={(e) => save({ category: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border px-3"
                >
                  {newsCategories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <NewsSourceField
                key={`source-${article.source}-${article.organization_id ?? ""}`}
                label="Source label"
                optional
                defaultValue={article.source ?? ""}
                knownSources={recentSourceRows}
                disabled={!canWrite}
                inputClassName="h-10 w-full rounded-lg border border-border px-3 text-sm"
                hint="Optional credit under the title on the app (leave blank to hide). Tap a recent source to reuse it."
                onCommit={(next) => {
                  const trimmed = next.trim();
                  if (trimmed !== (article.source ?? "").trim()) {
                    void save({ source: trimmed });
                  }
                }}
              />
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Author</span>
                <input
                  defaultValue={article.author}
                  onBlur={(e) => {
                    if (e.target.value !== article.author) save({ author: e.target.value });
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Status</span>
                <select
                  value={article.status}
                  onChange={(e) => save({ status: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border px-3"
                >
                  {newsStatuses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Sort order</span>
                <input
                  type="number"
                  defaultValue={article.sort_order}
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    if (value !== article.sort_order) save({ sort_order: value });
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
