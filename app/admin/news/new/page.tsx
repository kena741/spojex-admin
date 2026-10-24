"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Eye } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert } from "@/components/admin-layout";
import {
  extractNewsVideoPoster,
  uploadNewsFile,
  type NewsUploadOptions,
} from "@/components/news-media-fields";
import {
  MediaStage,
  type ComposerMediaMode,
} from "@/components/news-composer/media-stage";
import { PostingAs, type PostingOrg } from "@/components/news-composer/posting-as";
import { NewsSourceField } from "@/components/news-source-field";
import { NewsTikTokPreview } from "@/components/news-tiktok-preview";
import {
  classifyNewsMedia,
  newsCategories,
} from "@/lib/news";
import {
  loadComposerDraftId,
  loadOrgComposerPrefs,
  rememberComposerDraftId,
  saveOrgComposerPrefs,
} from "@/lib/news-composer-prefs";
import {
  captureVideoCoverFile,
  resolveNewsStoryMedia,
  type NewsUploadKind,
} from "@/lib/news-media";
import { rememberNewsSource } from "@/lib/news-sources";
import { adminFetch, postAdmin, postAdminResponse } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn } from "@/lib/utils";

const TITLE_MAX = 120;
const BODY_MAX = 2200;

type SaveState = "idle" | "saving" | "saved" | "failed";

type SuccessState = {
  id: string;
  published: boolean;
};

export default function NewsComposerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, staff } = useAdminPermissions();
  const canWrite = can("news:write");
  const canFeature = can("news:write");

  const prefillOrg =
    searchParams.get("organization_id") ||
    searchParams.get("org") ||
    searchParams.get("organization") ||
    "";
  const draftParam = searchParams.get("draft") || "";
  const orgLocked = Boolean(prefillOrg);

  const [orgId, setOrgId] = useState(prefillOrg);
  const [org, setOrg] = useState<PostingOrg | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("General");
  const [source, setSource] = useState("");
  const [featured, setFeatured] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [soundId, setSoundId] = useState("");
  const [soundName, setSoundName] = useState("");
  const [uploading, setUploading] = useState<NewsUploadKind | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);

  const [articleId, setArticleId] = useState<string | null>(draftParam || null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [publishing, setPublishing] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const orgRef = useRef<HTMLDivElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idempotencyRef = useRef<string>("");
  const hydrated = useRef(false);

  const media = classifyNewsMedia({
    video_url: videoUrl,
    audio_url: audioUrl,
    sound_id: soundId,
    image_urls: imageUrls,
    image_url: imageUrls[0],
  });

  const mode: ComposerMediaMode = videoUrl
    ? "video"
    : audioUrl && !soundId && imageUrls.length === 0
      ? "audio"
      : imageUrls.length > 0
        ? "image"
        : title.trim() || body.trim()
          ? "text"
          : "empty";

  const meaningful = Boolean(
    title.trim() ||
      body.trim() ||
      imageUrls.length ||
      videoUrl.trim() ||
      audioUrl.trim() ||
      soundId.trim(),
  );

  const dirtyPayload = useMemo(
    () =>
      JSON.stringify({
        orgId,
        title,
        body,
        category,
        source,
        featured,
        imageUrls,
        videoUrl,
        audioUrl,
        soundId,
      }),
    [audioUrl, body, category, featured, imageUrls, orgId, soundId, source, title, videoUrl],
  );

  const applyOrgPrefs = useCallback((id: string) => {
    const prefs = loadOrgComposerPrefs(id);
    if (prefs.category) setCategory(prefs.category);
    if (prefs.source) setSource(prefs.source);
  }, []);

  // Restore draft from session or URL
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const id = draftParam || loadComposerDraftId();
    if (!id) {
      if (prefillOrg) applyOrgPrefs(prefillOrg);
      return;
    }
    void (async () => {
      try {
        const res = await adminFetch(`/api/admin/news/${id}/workspace`);
        const json = await res.json();
        if (!res.ok) return;
        const article = (json as { article?: Record<string, unknown> }).article;
        const organization = (json as { organization?: PostingOrg }).organization;
        if (!article) return;
        if (String(article.status || "") !== "draft") {
          router.replace(`/admin/news/${id}`);
          return;
        }
        setArticleId(id);
        rememberComposerDraftId(id);
        setTitle(String(article.title || ""));
        setBody(String(article.body || ""));
        setCategory(String(article.category || "General"));
        setSource(String(article.source || ""));
        setFeatured(Boolean(article.is_featured));
        const gallery = Array.isArray(article.image_urls)
          ? article.image_urls.map((u) => String(u || "").trim()).filter(Boolean)
          : [];
        setImageUrls(gallery);
        setVideoUrl(String(article.video_url || ""));
        setAudioUrl(String(article.audio_url || ""));
        setSoundId(String(article.sound_id || ""));
        const oid = String(article.organization_id || organization?.id || "");
        setOrgId(oid);
        if (organization?.id) setOrg(organization);
        setSaveState("saved");
      } catch {
        // ignore restore failure
      }
    })();
  }, [applyOrgPrefs, draftParam, prefillOrg, router]);

  // Paste images/files globally when not typing in inputs that need paste
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      const items = event.clipboardData?.files;
      if (!items?.length) return;
      // Handled via MediaStage drop; trigger upload through a synthetic path
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const buildPatch = useCallback(
    (status: "draft" | "active") => {
      const gallery = imageUrls;
      const image = gallery[0] ?? "";
      return {
        title: title.trim() || "Untitled draft",
        body: body.trim(),
        summary: "",
        category,
        source: source.trim(),
        organization_id: orgId,
        image_url: image,
        cover_url: image,
        image_urls: gallery,
        video_url: videoUrl.trim(),
        audio_url: audioUrl.trim(),
        sound_id: soundId.trim() || null,
        status,
        is_featured: status === "active" ? featured : false,
      };
    },
    [audioUrl, body, category, featured, imageUrls, orgId, soundId, source, title, videoUrl],
  );

  const persistDraft = useCallback(
    async (opts?: { force?: boolean }): Promise<string | null> => {
      if (!canWrite) return articleId;
      if (!orgId.trim()) return articleId;
      if (!meaningful && !opts?.force) return articleId;

      setSaveState("saving");
      setError(null);
      try {
        if (!articleId) {
          const created = (await postAdmin("/api/admin/news", {
            ...buildPatch("draft"),
            title: title.trim() || "Untitled draft",
            status: "draft",
          })) as { id?: string };
          if (!created?.id) throw new Error("Could not create draft");
          setArticleId(created.id);
          rememberComposerDraftId(created.id);
          setSaveState("saved");
          saveOrgComposerPrefs(orgId, { category, source: source.trim() });
          return created.id;
        }
        await postAdminResponse(`/api/admin/news/${articleId}/actions`, {
          action: "save",
          patch: buildPatch("draft"),
        });
        setSaveState("saved");
        saveOrgComposerPrefs(orgId, { category, source: source.trim() });
        return articleId;
      } catch (err) {
        setSaveState("failed");
        setError(err instanceof Error ? err.message : "Save failed");
        return null;
      }
    },
    [articleId, body, buildPatch, canWrite, category, meaningful, orgId, source, title],
  );

  // Autosave debounce
  useEffect(() => {
    if (!canWrite || !orgId || !meaningful) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void persistDraft();
    }, 1400);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [canWrite, dirtyPayload, meaningful, orgId, persistDraft]);

  const uploadMedia = async (
    file: File,
    kind: NewsUploadKind,
    options?: NewsUploadOptions,
  ) => {
    setUploading(kind);
    setUploadPercent(0);
    setError(null);
    try {
      let id = articleId;
      if (!id && orgId) {
        id = await persistDraft({ force: true });
      }
      const needsCover =
        kind === "video" && imageUrls.length === 0;
      const coverPromise = needsCover
        ? captureVideoCoverFile(file).catch(() => null)
        : Promise.resolve(null);

      const publicUrl = await uploadNewsFile(id, file, kind, {
        onProgress: (pct) => {
          setUploadPercent(pct);
          options?.onProgress?.(pct);
        },
      });

      if (kind === "image") {
        if (videoUrl || (audioUrl && !soundId)) {
          // Cover for video/audio
          setImageUrls([publicUrl]);
        } else {
          setImageUrls((prev) =>
            prev.includes(publicUrl) ? prev : [...prev, publicUrl].slice(0, 10),
          );
        }
      }
      if (kind === "video") {
        setVideoUrl(publicUrl);
        setAudioUrl("");
        setSoundId("");
        if (needsCover) {
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
          if (coverUrl) setImageUrls([coverUrl]);
        }
      }
      if (kind === "audio") {
        setAudioUrl(publicUrl);
        setSoundId("");
        setVideoUrl("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
      setUploadPercent(0);
    }
  };

  const validatePublish = () => {
    const next: Record<string, string> = {};
    if (!orgId.trim()) next.org = "Choose who you are posting as.";
    if (!title.trim()) next.title = "Add a headline.";
    if (!imageUrls.length && !videoUrl.trim() && !audioUrl.trim() && !body.trim()) {
      next.media = "Add media or a caption before publishing.";
    }
    setFieldErrors(next);
    if (next.org) orgRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    else if (next.title) titleRef.current?.focus();
    return Object.keys(next).length === 0;
  };

  const publish = async () => {
    if (!canWrite || publishing) return;
    if (!validatePublish()) return;
    setPublishing(true);
    setError(null);
    const key = idempotencyRef.current || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    idempotencyRef.current = key;
    try {
      let id = articleId;
      if (!id) {
        id = await persistDraft({ force: true });
      } else {
        await persistDraft({ force: true });
      }
      if (!id) throw new Error("Could not save draft before publish");

      await postAdminResponse(`/api/admin/news/${id}/actions`, {
        action: "publish",
      });
      // Apply featured / final fields
      await postAdminResponse(`/api/admin/news/${id}/actions`, {
        action: "save",
        patch: {
          ...buildPatch("active"),
          is_featured: featured,
        },
      });
      if (featured) {
        await postAdminResponse(`/api/admin/news/${id}/actions`, { action: "feature" }).catch(
          () => undefined,
        );
      }
      if (source.trim()) rememberNewsSource(source.trim());
      saveOrgComposerPrefs(orgId, { category, source: source.trim() });
      rememberComposerDraftId(null);
      setSuccess({ id, published: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const saveDraftClick = async () => {
    if (!orgId.trim()) {
      setFieldErrors({ org: "Choose who you are posting as." });
      return;
    }
    const id = await persistDraft({ force: true });
    if (id) setSuccess({ id, published: false });
  };

  const createAnother = () => {
    setSuccess(null);
    setArticleId(null);
    rememberComposerDraftId(null);
    setTitle("");
    setBody("");
    setSource("");
    setImageUrls([]);
    setVideoUrl("");
    setAudioUrl("");
    setSoundId("");
    setSoundName("");
    setFeatured(false);
    setSaveState("idle");
    setError(null);
    setFieldErrors({});
    idempotencyRef.current = "";
    // keep org + category
  };

  const mediaKind = resolveNewsStoryMedia(videoUrl, audioUrl, null, {
    imageUrl: imageUrls[0],
    soundId,
  });

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "failed"
          ? "Save failed"
          : meaningful
            ? "Unsaved"
            : "Not saved yet";

  if (!canWrite) {
    return (
      <div>
        <AdminPageHeader title="Create news" backHref="/admin/news" />
        <AdminErrorAlert message="You need news:write permission to create posts." />
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-text-primary">
            {success.published ? "Published" : "Draft saved"}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {success.published
              ? "Your post is live on the home feed."
              : "You can keep editing or publish later."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href={`/admin/news/${success.id}`}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              {success.published ? "View post" : "Edit post"}
            </Link>
            <button
              type="button"
              onClick={createAnother}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium"
            >
              Create another
            </button>
            <Link
              href="/admin/news"
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium"
            >
              Sport News
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const Preview = (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-hint">
        Preview
      </p>
      {mode === "empty" && !title.trim() && !body.trim() ? (
        <div className="flex h-48 items-center justify-center rounded-xl bg-muted/40 text-center text-xs text-text-hint">
          Preview appears when you add media or a caption
        </div>
      ) : (
        <NewsTikTokPreview
          title={title}
          body={body}
          organizationName={org?.name || ""}
          source={source}
          imageUrl={imageUrls[0]}
          videoUrl={videoUrl}
          audioUrl={audioUrl}
          mediaKind={mediaKind}
          likeCount={0}
          commentCount={0}
          saveCount={0}
          shareCount={0}
        />
      )}
      <p className="mt-2 text-center text-[11px] text-text-hint">
        {media.label}
        {media.has_soundtrack ? " · Soundtrack" : ""}
      </p>
    </div>
  );

  return (
    <div className="pb-28">
      <AdminPageHeader
        title="Create news"
        description="Post as an organization - media first, then caption."
        backHref="/admin/news"
        breadcrumbs={[
          { label: "Content", href: "/admin/content" },
          { label: "Sport News", href: "/admin/news" },
          { label: "Create" },
        ]}
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm lg:hidden"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
        <div className="space-y-4">
          <div ref={orgRef}>
            <PostingAs
              value={orgId}
              org={org}
              locked={orgLocked && Boolean(prefillOrg)}
              onChange={(id, next) => {
                setOrgId(id);
                setOrg(next);
                applyOrgPrefs(id);
                setFieldErrors((prev) => {
                  const { org: _o, ...rest } = prev;
                  return rest;
                });
              }}
            />
            {fieldErrors.org ? (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.org}</p>
            ) : null}
          </div>

          <MediaStage
            articleId={articleId}
            mode={mode === "text" ? "empty" : mode}
            imageUrls={imageUrls}
            videoUrl={videoUrl}
            audioUrl={audioUrl}
            soundId={soundId}
            soundName={soundName}
            coverUrl={imageUrls[0] || ""}
            uploading={uploading}
            uploadPercent={uploadPercent}
            onUpload={(file, kind, options) => void uploadMedia(file, kind, options)}
            onReorderImages={setImageUrls}
            onRemoveImageAt={(index) =>
              setImageUrls((prev) => prev.filter((_, i) => i !== index))
            }
            onClearMedia={() => {
              setImageUrls([]);
              setSoundId("");
              setSoundName("");
              if (!videoUrl) setAudioUrl("");
            }}
            onRemoveVideo={() => {
              setVideoUrl("");
              setImageUrls([]);
            }}
            onRemoveAudio={() => {
              setAudioUrl("");
              setSoundId("");
              setSoundName("");
            }}
            onTrimVideo={(result) => setVideoUrl(result.publicUrl)}
            onSoundSelect={(sound) => {
              setSoundId(sound?.id ?? "");
              setSoundName(sound?.name?.trim() ?? "");
              setAudioUrl(sound?.audio_url?.trim() ?? "");
            }}
            onReplaceImageAt={async (index, file) => {
              const url = await uploadNewsFile(articleId, file, "image", {
                onProgress: setUploadPercent,
              });
              setImageUrls((prev) => {
                const next = [...prev];
                next[index] = url;
                return next;
              });
            }}
            onSetCoverFromVideo={(url) => setImageUrls([url])}
            onFocusCaption={(field) => {
              const el = field === "title" ? titleRef.current : bodyRef.current;
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              el?.focus();
            }}
          />
          {fieldErrors.media ? (
            <p className="text-xs text-rose-600">{fieldErrors.media}</p>
          ) : null}

          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <label className="block text-sm">
              <span className="mb-1 flex items-center justify-between text-text-secondary">
                Headline
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    title.length > TITLE_MAX - 10 ? "text-amber-700" : "text-text-hint",
                  )}
                >
                  {title.length}/{TITLE_MAX}
                </span>
              </span>
              <input
                ref={titleRef}
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setFieldErrors((prev) => {
                    const { title: _t, ...rest } = prev;
                    return rest;
                  });
                }}
                placeholder="What’s happening?"
                className="h-11 w-full rounded-xl border border-border px-3 text-sm"
              />
              {fieldErrors.title ? (
                <p className="mt-1 text-xs text-rose-600">{fieldErrors.title}</p>
              ) : null}
            </label>
            <label className="block text-sm">
              <span className="mb-1 flex items-center justify-between text-text-secondary">
                Caption
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    body.length > BODY_MAX - 40 ? "text-amber-700" : "text-text-hint",
                  )}
                >
                  {body.length}/{BODY_MAX}
                </span>
              </span>
              <textarea
                ref={bodyRef}
                value={body}
                maxLength={BODY_MAX}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="Write a short caption…"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm leading-relaxed"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-text-secondary">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 w-full rounded-xl border border-border px-3 text-sm"
              >
                {newsCategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
            >
              More options
              <ChevronDown
                className={cn("h-4 w-4 transition", moreOpen && "rotate-180")}
              />
            </button>
            {moreOpen ? (
              <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
                <NewsSourceField
                  label="Source credit"
                  optional
                  value={source}
                  onChange={setSource}
                  knownSources={[]}
                  inputClassName="h-10 w-full rounded-xl border border-border px-3 text-sm"
                  hint="Optional. Separate from posting identity."
                />
                {canFeature ? (
                  <label className="flex items-center gap-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={featured}
                      onChange={(e) => setFeatured(e.target.checked)}
                    />
                    Feature on home when published
                  </label>
                ) : null}
                <p className="text-xs text-text-hint">
                  Author: {staff?.full_name || staff?.email || "Signed-in admin"} (from your
                  account)
                </p>
                <p className="text-xs text-text-hint">
                  Related entity linking (gym / stadium / event) requires a backend field - coming
                  next. Publishing organization stays the owner.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="hidden lg:block">{Preview}</aside>
      </div>

      {/* Persistent footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <span
            className={cn(
              "text-xs font-medium",
              saveState === "failed"
                ? "text-rose-600"
                : saveState === "saving"
                  ? "text-amber-700"
                  : "text-text-hint",
            )}
          >
            {saveLabel}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              disabled={publishing || Boolean(uploading)}
              onClick={() => void saveDraftClick()}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={publishing || Boolean(uploading)}
              onClick={() => void publish()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40 lg:hidden">
          <button
            type="button"
            className="flex-1"
            aria-label="Close preview"
            onClick={() => setPreviewOpen(false)}
          />
          <div className="h-full w-full max-w-sm overflow-y-auto bg-background p-4">
            <div className="mb-3 flex justify-between">
              <p className="text-sm font-semibold">Preview</p>
              <button
                type="button"
                className="text-sm text-primary"
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </button>
            </div>
            {Preview}
          </div>
        </div>
      ) : null}
    </div>
  );
}
