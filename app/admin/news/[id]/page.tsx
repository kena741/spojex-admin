"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { newsCategories, newsStatusLabel, newsStatuses } from "@/lib/news";
import { deleteAdmin, patchAdmin } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { OrganizationRow, SportNewsRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type MediaKind = "none" | "video" | "audio";
type UploadKind = "video" | "audio" | "thumbnail" | "cover";

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary";

function NewsOrgPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (orgId: string) => void;
}) {
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const appliedDefault = useRef(false);

  useEffect(() => {
    getSupabase()
      .from("organizations")
      .select("id, name, public_id, logo_url, user_id, is_platform, verified")
      .order("is_platform", { ascending: false })
      .order("name")
      .limit(200)
      .then(({ data }) => {
        setOrgs((data ?? []) as OrganizationRow[]);
      });
  }, []);

  useEffect(() => {
    if (disabled || value || appliedDefault.current || orgs.length === 0) return;
    const platform = orgs.find((item) => item.is_platform);
    if (!platform?.id) return;
    appliedDefault.current = true;
    onChange(platform.id);
  }, [disabled, onChange, orgs, value]);

  const selected = orgs.find((item) => item.id === value);

  return (
    <label className="grid gap-1 text-sm">
      <span className="mb-1 block text-text-secondary">Publishing organization</span>
      <select
        className={fieldClass}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">— None —</option>
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.is_platform ? "★ " : ""}
            {org.name}
            {org.is_platform ? " (SpoJex)" : ""}
            {org.verified ? " ✓" : ""}
          </option>
        ))}
      </select>
      {selected ? (
        <p className="text-xs text-text-secondary">
          App users follow this org from the news rail ·{" "}
          <Link href={`/admin/organizations/${selected.id}`} className="text-primary underline">
            View org
          </Link>
        </p>
      ) : (
        <p className="text-xs text-text-secondary">
          Link an organization so readers can follow who posted the story. Run
          migration 104 if this field fails to save.
        </p>
      )}
    </label>
  );
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error("Upload failed. Try a smaller file or refresh the page.");
  }
  try {
    return JSON.parse(text) as { error?: string; path?: string; token?: string; publicUrl?: string; kind?: string };
  } catch {
    throw new Error("Upload failed. Unexpected server response.");
  }
}

export default function NewsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("news:write");
  const [article, setArticle] = useState<SportNewsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState<UploadKind | null>(null);
  const [pickedKind, setPickedKind] = useState<MediaKind | null>(null);

  const load = async () => {
    const { data, error: loadError } = await getSupabase()
      .from("sport_news")
      .select(
        "*, organizations(id, name, logo_url, user_id, public_id, is_platform, verified)",
      )
      .eq("id", id)
      .maybeSingle();
    if (loadError) {
      const plain = await getSupabase()
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

  const save = async (patch: Record<string, unknown>) => {
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(`/api/admin/news/${id}`, patch);
      await load();
      setNotice("Saved.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    }
  };

  const publish = async () => {
    await save({
      status: "active",
      published_at: new Date().toISOString(),
    });
  };

  const uploadMedia = async (file: File, kind: UploadKind) => {
    setUploading(kind);
    setError(null);
    setNotice(null);
    try {
      const signResponse = await fetch(`/api/admin/news/${id}/media`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const signed = await readJson(signResponse);
      if (!signResponse.ok) throw new Error(signed.error || "Upload could not start");
      if (!signed.path || !signed.token || !signed.publicUrl) {
        throw new Error("Upload could not start. Run 074_news_media.sql in Supabase.");
      }
      const { error: uploadError } = await getSupabase().storage
        .from("sport-news")
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType: file.type || undefined,
        });
      if (uploadError) throw new Error(uploadError.message);
      if (kind === "video") {
        if (article?.audio_url?.trim()) {
          throw new Error("Remove the audio file before uploading video.");
        }
        if (!(await save({ video_url: signed.publicUrl, cover_url: "" }))) return;
        setPickedKind("video");
      } else if (kind === "audio") {
        if (article?.video_url?.trim()) {
          throw new Error("Remove the video file before uploading audio.");
        }
        if (!(await save({ audio_url: signed.publicUrl }))) return;
        setPickedKind("audio");
      } else if (kind === "thumbnail") {
        if (!(await save({ image_url: signed.publicUrl }))) return;
      } else if (!(await save({ cover_url: signed.publicUrl }))) {
        return;
      }
      setNotice(kind === "video" ? "Video added." : kind === "audio" ? "Audio added." : "Image added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const setMediaKind = (kind: MediaKind) => {
    const hasVideo = Boolean(article?.video_url?.trim());
    const hasAudio = Boolean(article?.audio_url?.trim());
    if (hasVideo && kind !== "video") return;
    if (hasAudio && kind !== "audio") return;
    setPickedKind(kind);
  };

  const removeVideo = async () => {
    if (!(await save({ video_url: "" }))) return;
    setPickedKind("none");
  };

  const removeAudio = async () => {
    if (!(await save({ audio_url: "" }))) return;
    setPickedKind("none");
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

  const hasVideo = Boolean(article.video_url?.trim());
  const hasAudio = Boolean(article.audio_url?.trim());
  const mediaKind: MediaKind = hasVideo
    ? "video"
    : hasAudio
      ? "audio"
      : (pickedKind ?? "none");
  const thumb = article.image_url?.trim() || "";
  const cover = article.cover_url?.trim() || "";
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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          {mediaKind === "video" && article.video_url ? (
            <video
              src={article.video_url}
              controls
              poster={thumb || undefined}
              className="mb-4 h-48 w-full rounded-lg bg-black object-contain"
            />
          ) : null}
          {mediaKind !== "video" && (cover || thumb) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover || thumb}
              alt=""
              className="mb-4 h-48 w-full rounded-lg object-cover"
            />
          ) : null}
          {mediaKind === "video" && thumb && !article.video_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="mb-4 h-48 w-full rounded-lg object-cover" />
          ) : null}
          {mediaKind === "audio" && article.audio_url ? (
            <audio src={article.audio_url} controls className="mb-4 w-full" />
          ) : null}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold">Preview</h2>
            <StatusBadge tone={requestTone(article.status)}>
              {newsStatusLabel(article.status)}
            </StatusBadge>
          </div>
          <p className="mb-2 text-sm font-medium text-text-secondary">{article.summary}</p>
          <p className="text-sm text-text-secondary whitespace-pre-wrap">
            {article.body || "No body yet."}
          </p>
          <p className="mt-4 text-xs text-text-hint">
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
                <span className="mb-1 block text-text-secondary">Summary</span>
                <input
                  defaultValue={article.summary}
                  onBlur={(e) => {
                    if (e.target.value !== article.summary) save({ summary: e.target.value });
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Body</span>
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
              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-sm font-medium">Media</p>
                <p className="mb-3 text-xs text-text-secondary">
                  Text only, video, or audio. After a video or audio file is uploaded, remove it
                  before choosing the other type.
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {([
                    ["none", "Text only", hasVideo || hasAudio, hasVideo ? "Remove the video first" : hasAudio ? "Remove the audio first" : ""],
                    ["video", "Video", hasAudio, "Remove the audio file first"],
                    ["audio", "Audio", hasVideo, "Remove the video file first"],
                  ] as const).map(([id, label, locked, reason]) => (
                    <button
                      key={id}
                      type="button"
                      disabled={locked}
                      title={locked ? reason : undefined}
                      onClick={() => setMediaKind(id)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                        mediaKind === id
                          ? "bg-primary text-primary-foreground"
                          : locked
                            ? "cursor-not-allowed border border-border bg-muted text-text-hint"
                            : "border border-border bg-card hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {mediaKind !== "video" ? (
                  <label className="mb-3 block text-sm">
                    <span className="mb-1 block text-text-secondary">Cover image</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={Boolean(uploading)}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadMedia(file, "cover");
                        e.target.value = "";
                      }}
                      className="mb-2 block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                    />
                    <input
                      key={`cover-${article.cover_url}`}
                      defaultValue={article.cover_url}
                      onBlur={(e) => {
                        if (e.target.value !== article.cover_url) save({ cover_url: e.target.value });
                      }}
                      placeholder="or paste image URL"
                      className="h-10 w-full rounded-lg border border-border px-3"
                    />
                  </label>
                ) : null}

                <label className="mb-3 block text-sm">
                  <span className="mb-1 block text-text-secondary">Thumbnail</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={Boolean(uploading)}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadMedia(file, "thumbnail");
                      e.target.value = "";
                    }}
                    className="mb-2 block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                  />
                  <input
                    key={`thumb-${article.image_url}`}
                    defaultValue={article.image_url}
                    onBlur={(e) => {
                      if (e.target.value !== article.image_url) save({ image_url: e.target.value });
                    }}
                    placeholder="or paste image URL"
                    className="h-10 w-full rounded-lg border border-border px-3"
                  />
                </label>
                <p className="mb-3 text-xs text-text-secondary">JPG, PNG, WebP, or GIF · max 5 MB</p>

                {mediaKind === "video" ? (
                  <div className="border-t border-border pt-3">
                    <p className="mb-2 text-sm font-medium">Video file</p>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
                      disabled={Boolean(uploading) || hasAudio}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadMedia(file, "video");
                        e.target.value = "";
                      }}
                      className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                    />
                    <p className="mt-1 text-xs text-text-secondary">MP4, WebM, or MOV · max 50 MB</p>
                    {uploading === "video" ? (
                      <p className="mt-1 text-xs text-text-secondary">Uploading video…</p>
                    ) : null}
                    <input
                      key={article.video_url}
                      defaultValue={article.video_url ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (article.video_url ?? "")) {
                          if (hasAudio) {
                            setError("Remove the audio file before adding video.");
                            return;
                          }
                          save({ video_url: e.target.value, cover_url: "" });
                        }
                      }}
                      placeholder="or paste a direct video URL"
                      className="mt-2 h-10 w-full rounded-lg border border-border px-3"
                    />
                    {article.video_url ? (
                      <button
                        type="button"
                        onClick={() => void removeVideo()}
                        className="mt-2 text-xs font-medium text-red-700 hover:underline"
                      >
                        Remove video
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {mediaKind === "audio" ? (
                  <div className="border-t border-border pt-3">
                    <p className="mb-2 text-sm font-medium">Audio file</p>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg"
                      disabled={Boolean(uploading) || hasVideo}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadMedia(file, "audio");
                        e.target.value = "";
                      }}
                      className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                    />
                    <p className="mt-1 text-xs text-text-secondary">MP3, M4A, AAC, WAV, or OGG · max 20 MB</p>
                    {uploading === "audio" ? (
                      <p className="mt-1 text-xs text-text-secondary">Uploading audio…</p>
                    ) : null}
                    <input
                      key={article.audio_url}
                      defaultValue={article.audio_url ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (article.audio_url ?? "")) {
                          if (hasVideo) {
                            setError("Remove the video file before adding audio.");
                            return;
                          }
                          save({ audio_url: e.target.value });
                        }
                      }}
                      placeholder="or paste a direct audio URL"
                      className="mt-2 h-10 w-full rounded-lg border border-border px-3"
                    />
                    {article.audio_url ? (
                      <button
                        type="button"
                        onClick={() => void removeAudio()}
                        className="mt-2 text-xs font-medium text-red-700 hover:underline"
                      >
                        Remove audio
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {uploading && uploading !== "video" && uploading !== "audio" ? (
                  <p className="mt-2 text-xs text-text-secondary">Uploading image…</p>
                ) : null}
              </div>
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
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Source label</span>
                <input
                  key={`source-${article.source}-${article.organization_id ?? ""}`}
                  defaultValue={article.source}
                  onBlur={(e) => {
                    if (e.target.value !== article.source) save({ source: e.target.value });
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
                <p className="mt-1 text-xs text-text-secondary">
                  Auto-fills from the organization name when you link an org.
                </p>
              </label>
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
