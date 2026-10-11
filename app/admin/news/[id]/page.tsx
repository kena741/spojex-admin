"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { NewsMediaFields, NewsMediaPreview, uploadNewsFile } from "@/components/news-media-fields";
import { newsCategories, newsStatusLabel, newsStatuses } from "@/lib/news";
import { resolveNewsStoryMedia, type NewsStoryMedia, type NewsUploadKind } from "@/lib/news-media";
import { deleteAdmin, patchAdmin } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { OrganizationRow, SportNewsRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

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

export default function NewsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("news:write");
  const [article, setArticle] = useState<SportNewsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState<NewsUploadKind | null>(null);
  const [pickedKind, setPickedKind] = useState<NewsStoryMedia | null>(null);

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

  const uploadMedia = async (file: File, kind: NewsUploadKind) => {
    setUploading(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "video" && article?.audio_url?.trim()) {
        throw new Error("Remove the audio file before uploading video.");
      }
      if (kind === "audio" && article?.video_url?.trim()) {
        throw new Error("Remove the video file before uploading audio.");
      }
      const publicUrl = await uploadNewsFile(id, file, kind);
      if (kind === "video") {
        if (!(await save({ video_url: publicUrl }))) return;
        setPickedKind("video");
      } else if (kind === "audio") {
        if (!(await save({ audio_url: publicUrl }))) return;
        setPickedKind("audio");
      } else if (!(await save({ image_url: publicUrl, cover_url: publicUrl }))) {
        return;
      }
      setNotice(kind === "video" ? "Video added." : kind === "audio" ? "Audio added." : "Image added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
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

  const mediaKind = resolveNewsStoryMedia(article.video_url ?? "", article.audio_url ?? "", pickedKind);
  const image = article.image_url?.trim() || article.cover_url?.trim() || "";
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
          <NewsMediaPreview
            imageUrl={image}
            videoUrl={article.video_url ?? ""}
            audioUrl={article.audio_url ?? ""}
            mediaKind={mediaKind}
          />
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
              <NewsMediaFields
                imageUrl={image}
                videoUrl={article.video_url ?? ""}
                audioUrl={article.audio_url ?? ""}
                pickedKind={pickedKind}
                uploading={uploading}
                disabled={!canWrite}
                onKind={setPickedKind}
                onUpload={(file, kind) => void uploadMedia(file, kind)}
                onImageUrl={(url) => {
                  if (url !== image) void save({ image_url: url, cover_url: url });
                }}
                onVideoUrl={(url) => {
                  if (article.audio_url?.trim()) {
                    setError("Remove the audio file before adding video.");
                    return;
                  }
                  if (url !== (article.video_url ?? "")) void save({ video_url: url });
                }}
                onAudioUrl={(url) => {
                  if (article.video_url?.trim()) {
                    setError("Remove the video file before adding audio.");
                    return;
                  }
                  if (url !== (article.audio_url ?? "")) void save({ audio_url: url });
                }}
                onRemoveVideo={() => void removeVideo()}
                onRemoveAudio={() => void removeAudio()}
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
