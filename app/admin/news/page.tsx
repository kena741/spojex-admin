"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  AdminStatCard,
  AdminTableShell,
  type AdminRowMenuItem,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  NewsMediaFields,
  removeNewsVideoWatermark,
  extractNewsVideoPoster,
  uploadNewsFile,
  type NewsUploadOptions,
  type NewsWatermarkMode,
  type NewsWatermarkPreset,
} from "@/components/news-media-fields";
import { NewsOrgPicker } from "@/components/news-org-picker";
import { NewsSourceField } from "@/components/news-source-field";
import { NewsTikTokPreview } from "@/components/news-tiktok-preview";
import {
  classifyNewsMedia,
  newsCategories,
  newsMediaTypes,
  newsStatusLabel,
  newsStatuses,
  normalizeNewsStatusFilter,
  type NewsDirectoryResponse,
  type NewsDirectoryRow,
} from "@/lib/news";
import { rememberNewsSource } from "@/lib/news-sources";
import {
  captureVideoCoverFile,
  resolveNewsStoryMedia,
  type NewsStoryMedia,
  type NewsUploadKind,
} from "@/lib/news-media";
import { adminFetch, deleteAdmin, postAdmin, postAdminResponse } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { formatDate } from "@/lib/utils";

export default function NewsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can, staff } = useAdminPermissions();
  const canWrite = can("news:write");
  const authorName = staff?.full_name?.trim() || staff?.email?.trim() || "";

  const status = normalizeNewsStatusFilter(searchParams.get("status"));
  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || "all";
  const organizationId = searchParams.get("organization_id") || "";
  const mediaType = searchParams.get("media_type") || "all";
  const featuredFilter = searchParams.get("featured") || "all";
  const publishedFrom = searchParams.get("published_from") || "";
  const publishedTo = searchParams.get("published_to") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("page_size") || "40") || 40));
  const sort = searchParams.get("sort") || "recency";
  const order = searchParams.get("order") || "desc";

  const [payload, setPayload] = useState<NewsDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [categoryValue, setCategoryValue] = useState("General");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [soundId, setSoundId] = useState("");
  const [pickedKind, setPickedKind] = useState<NewsStoryMedia | null>("none");
  const [uploading, setUploading] = useState<NewsUploadKind | null>(null);
  const [statusValue, setStatusValue] = useState("draft");
  const [featured, setFeatured] = useState(false);

  const writeParams = useCallback(
    (patch: Record<string, string | null>, opts?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
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
      if (query.trim()) params.set("q", query.trim());
      if (status !== "all") params.set("status", status);
      if (category !== "all") params.set("category", category);
      if (organizationId) params.set("organization_id", organizationId);
      if (mediaType !== "all") params.set("media_type", mediaType);
      if (featuredFilter !== "all") params.set("featured", featuredFilter);
      if (publishedFrom) params.set("published_from", publishedFrom);
      if (publishedTo) params.set("published_to", publishedTo);
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      params.set("sort", sort);
      params.set("order", order);
      const res = await adminFetch(`/api/admin/news?${params}`);
      const json = (await res.json()) as NewsDirectoryResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load news");
      setPayload(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [
    category,
    featuredFilter,
    mediaType,
    order,
    organizationId,
    page,
    pageSize,
    publishedFrom,
    publishedTo,
    query,
    sort,
    status,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = payload?.data ?? [];
  const totals = payload?.totals ?? {};
  const filterMeta = payload?.filters;
  const filteredTotal = payload?.filtered_total ?? payload?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: Record<string, string | null> }> = [];
    if (status !== "all") {
      chips.push({
        key: "status",
        label: `Status: ${newsStatusLabel(status)}`,
        clear: { status: null },
      });
    }
    if (category !== "all") {
      chips.push({ key: "category", label: `Category: ${category}`, clear: { category: null } });
    }
    if (organizationId) {
      const name =
        filterMeta?.organizations?.find((o) => o.id === organizationId)?.name || organizationId;
      chips.push({
        key: "org",
        label: `Org: ${name}`,
        clear: { organization_id: null },
      });
    }
    if (mediaType !== "all") {
      const label = newsMediaTypes.find((m) => m.id === mediaType)?.label || mediaType;
      chips.push({
        key: "media",
        label: `Media: ${label}`,
        clear: { media_type: null },
      });
    }
    if (featuredFilter !== "all") {
      chips.push({
        key: "featured",
        label: featuredFilter === "featured" ? "Featured" : "Standard",
        clear: { featured: null },
      });
    }
    if (publishedFrom || publishedTo) {
      chips.push({
        key: "dates",
        label: `Dates: ${publishedFrom || "…"} → ${publishedTo || "…"}`,
        clear: { published_from: null, published_to: null },
      });
    }
    if (query.trim()) {
      chips.push({ key: "q", label: `Search: ${query.trim()}`, clear: { q: null } });
    }
    return chips;
  }, [
    category,
    featuredFilter,
    filterMeta?.organizations,
    mediaType,
    organizationId,
    publishedFrom,
    publishedTo,
    query,
    status,
  ]);

  const clearAllFilters = () => {
    writeParams({
      q: null,
      status: null,
      category: null,
      organization_id: null,
      media_type: null,
      featured: null,
      published_from: null,
      published_to: null,
      page: null,
    });
  };

  const runAction = async (row: NewsDirectoryRow, action: string) => {
    if (!canWrite) return;
    setBusyId(row.id);
    setError(null);
    try {
      await postAdminResponse(`/api/admin/news/${row.id}/actions`, { action });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const removeHard = async (row: NewsDirectoryRow) => {
    if (!window.confirm(`Permanently delete "${row.title}"? This cannot be undone.`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      await deleteAdmin(`/api/admin/news/${row.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const rowMenuItems = (row: NewsDirectoryRow): AdminRowMenuItem[] => {
    const statusLower = String(row.status || "").toLowerCase();
    const items: AdminRowMenuItem[] = [
      { id: "open", label: "Open / Edit", href: row.href || `/admin/news/${row.id}` },
    ];
    if (!canWrite) return items;
    if (statusLower === "draft") {
      items.push({
        id: "publish",
        label: "Publish",
        tone: "success",
        onClick: () => void runAction(row, "publish"),
      });
    }
    if (statusLower === "active" || statusLower === "published") {
      items.push({
        id: row.is_featured ? "unfeature" : "feature",
        label: row.is_featured ? "Remove featured" : "Feature on home",
        onClick: () => void runAction(row, row.is_featured ? "unfeature" : "feature"),
      });
    }
    if (statusLower !== "archived" && statusLower !== "archive" && statusLower !== "hidden") {
      items.push({
        id: "archive",
        label: "Archive",
        onClick: () => void runAction(row, "archive"),
      });
    } else {
      items.push({
        id: "restore",
        label: "Restore to draft",
        onClick: () => void runAction(row, "restore_draft"),
      });
      items.push({
        id: "republish",
        label: "Publish again",
        tone: "success",
        onClick: () => void runAction(row, "publish"),
      });
    }
    items.push({
      id: "delete",
      label: "Delete permanently",
      tone: "danger",
      separatorBefore: true,
      onClick: () => void removeHard(row),
    });
    return items;
  };

  const resetCreate = () => {
    setTitle("");
    setBody("");
    setSource("");
    setOrgId("");
    setOrgName("");
    setImageUrl("");
    setImageUrls([]);
    setVideoUrl("");
    setAudioUrl("");
    setSoundId("");
    setPickedKind("none");
    setCategoryValue("General");
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
      const needsAutoCover = kind === "video" && imageUrls.length === 0 && !imageUrl.trim();
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
        if (needsAutoCover) {
          let coverUrl = "";
          const coverFile = await coverPromise;
          if (coverFile) {
            try {
              coverUrl = await uploadNewsFile(null, coverFile, "image");
            } catch {
              coverUrl = "";
            }
          }
          if (!coverUrl) {
            try {
              coverUrl = await extractNewsVideoPoster(null, publicUrl);
            } catch {
              coverUrl = "";
            }
          }
          if (coverUrl) {
            setImageUrls([coverUrl]);
            setImageUrl(coverUrl);
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

  const create = async () => {
    if (!canWrite || !title.trim() || uploading) return;
    if (!orgId.trim()) {
      setError("Publishing organization is required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const gallery =
        imageUrls.length > 0 ? imageUrls : imageUrl.trim() ? [imageUrl.trim()] : [];
      const image = gallery[0] ?? "";
      const sourceLabel = source.trim();
      const created = (await postAdmin("/api/admin/news", {
        title: title.trim(),
        category: categoryValue,
        status: statusValue,
        summary: "",
        body: body.trim(),
        source: sourceLabel,
        organization_id: orgId.trim(),
        image_url: image,
        cover_url: image,
        image_urls: gallery,
        video_url: videoUrl.trim(),
        audio_url: audioUrl.trim(),
        sound_id: soundId.trim() || null,
        is_featured: featured,
      })) as { id?: string } | null;
      if (sourceLabel) rememberNewsSource(sourceLabel);
      resetCreate();
      setCreateOpen(false);
      if (created?.id) {
        router.push(`/admin/news/${created.id}`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const createMedia = classifyNewsMedia({
    video_url: videoUrl,
    audio_url: audioUrl,
    sound_id: soundId,
    image_url: imageUrls[0] ?? imageUrl,
    image_urls: imageUrls,
  });

  return (
    <>
      <AdminPageHeader
        title="Sport News"
        description="Publish stories for the home feed. Filters persist in the URL so overview drill-downs stay selected."
        breadcrumbs={[
          { label: "Content", href: "/admin/content" },
          { label: "Sport News" },
        ]}
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

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <AdminStatCard title="All (catalog)" value={`${totals.all ?? "—"}`} />
        <button
          type="button"
          className="text-left"
          onClick={() => writeParams({ status: "active" })}
        >
          <AdminStatCard title="Published" value={`${totals.published ?? "—"}`} />
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => writeParams({ status: "draft" })}
        >
          <AdminStatCard title="Draft" value={`${totals.draft ?? "—"}`} />
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => writeParams({ status: "archived" })}
        >
          <AdminStatCard title="Archived" value={`${totals.archived ?? "—"}`} />
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => writeParams({ featured: "featured", status: null })}
        >
          <AdminStatCard title="Featured" value={`${totals.featured ?? "—"}`} />
        </button>
      </div>
      <p className="mb-4 text-xs text-text-hint">
        Catalog totals match Content Overview definitions. Table below shows filtered results (
        {loading ? "…" : filteredTotal}).
      </p>

      {error ? (
        <div className="mb-4">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            className="-mt-2 mb-2 text-sm font-medium text-primary hover:underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <AdminFilterPanel>
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <div className="lg:col-span-2 xl:col-span-2">
            <AdminSearchInput
              value={query}
              onChange={(value) => writeParams({ q: value || null })}
              placeholder="Search headline, category, source"
            />
          </div>
          <AdminSelect
            value={status}
            onChange={(value) => writeParams({ status: value === "all" ? null : value })}
          >
            <option value="all">All statuses</option>
            {newsStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={category}
            onChange={(value) => writeParams({ category: value === "all" ? null : value })}
          >
            <option value="all">All categories</option>
            {(filterMeta?.categories?.length ? filterMeta.categories : [...newsCategories]).map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ),
            )}
          </AdminSelect>
          <AdminSelect
            value={mediaType}
            onChange={(value) => writeParams({ media_type: value === "all" ? null : value })}
          >
            <option value="all">All media</option>
            {newsMediaTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={featuredFilter}
            onChange={(value) => writeParams({ featured: value === "all" ? null : value })}
          >
            <option value="all">All placement</option>
            <option value="featured">Featured</option>
            <option value="standard">Standard</option>
          </AdminSelect>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminSelect
            value={organizationId || "all"}
            onChange={(value) =>
              writeParams({ organization_id: value === "all" ? null : value })
            }
          >
            <option value="all">All organizations</option>
            {(filterMeta?.organizations ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </AdminSelect>
          <label className="text-xs text-text-secondary">
            From
            <input
              type="date"
              value={publishedFrom}
              onChange={(e) => writeParams({ published_from: e.target.value || null })}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            />
          </label>
          <label className="text-xs text-text-secondary">
            To
            <input
              type="date"
              value={publishedTo}
              onChange={(e) => writeParams({ published_to: e.target.value || null })}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            />
          </label>
          <AdminSelect
            value={`${sort}:${order}`}
            onChange={(value) => {
              const [s, o] = value.split(":");
              writeParams({ sort: s || "recency", order: o || "desc" });
            }}
          >
            <option value="recency:desc">Newest first</option>
            <option value="recency:asc">Oldest first</option>
            <option value="updated:desc">Recently updated</option>
            <option value="title:asc">Title A–Z</option>
            <option value="likes:desc">Most liked</option>
            <option value="comments:desc">Most commented</option>
          </AdminSelect>
        </div>
        {activeChips.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => writeParams(chip.clear)}
                className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-text-secondary hover:bg-muted"
              >
                {chip.label} ×
              </button>
            ))}
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={clearAllFilters}
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </AdminFilterPanel>

      {loading ? <AdminLoadingRow label="Loading articles…" /> : null}

      <AdminTableShell>
        {!loading && rows.length === 0 ? (
          <AdminEmpty
            title={activeChips.length ? "No matching articles" : "No articles yet"}
            description={
              activeChips.length
                ? "Try clearing filters or adjusting the date range."
                : "Create sport news to show on the home feed."
            }
          />
        ) : null}
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Article</th>
                  <th className="px-4 py-3 font-semibold">Media</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Placement</th>
                  <th className="px-4 py-3 font-semibold">Engagement</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const thumb = (row.thumbnail || "").trim();
                  const dateLabel = row.display_date?.label || "Date";
                  const dateAt = row.display_date?.at;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              className="h-12 w-16 rounded-md object-cover bg-muted"
                            />
                          ) : (
                            <div className="grid h-12 w-16 place-items-center rounded-md bg-muted text-[10px] text-text-hint">
                              {row.media_label || row.media_type}
                            </div>
                          )}
                          <div className="min-w-0">
                            <Link
                              href={row.href || `/admin/news/${row.id}`}
                              className="font-medium text-text-primary hover:text-primary"
                            >
                              {row.title}
                            </Link>
                            <p className="mt-0.5 truncate text-xs text-text-secondary">
                              {row.organization_name || "No organization"}
                              {row.source?.trim() ? ` · ${row.source.trim()}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-text-secondary">
                            {row.media_label || row.media_type}
                          </span>
                          {row.has_soundtrack ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                              Soundtrack
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.category || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={requestTone(row.status)}>
                          {row.status_label || newsStatusLabel(row.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {row.featured_label || (row.is_featured ? "Featured" : "Standard")}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        <span title="Lifetime engagement">
                          Likes {row.engagement?.likes ?? 0} · Comments{" "}
                          {row.engagement?.comments ?? 0} · Saves {row.engagement?.saves ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        <div className="font-medium text-text-primary">{dateLabel}</div>
                        <div>{dateAt ? formatDate(dateAt) : "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {row.updated_at ? formatDate(row.updated_at) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={row.href || `/admin/news/${row.id}`}
                            className="text-sm font-medium text-primary"
                          >
                            Open
                          </Link>
                          <AdminRowMenu
                            items={rowMenuItems(row)}
                            disabled={busyId === row.id}
                            aria-label={`Actions for ${row.title}`}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {!loading && filteredTotal > pageSize ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
            <p className="text-text-secondary">
              Page {page} of {totalPages} · {filteredTotal} result
              {filteredTotal === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                onClick={() => writeParams({ page: String(page - 1) }, { resetPage: false })}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                onClick={() => writeParams({ page: String(page + 1) }, { resetPage: false })}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
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
            saveLabel="Create draft"
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
              value={categoryValue}
              onChange={(e) => setCategoryValue(e.target.value)}
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
            value={orgId}
            disabled={creating || Boolean(uploading)}
            onChange={(nextId, org) => {
              setOrgId(nextId);
              setOrgName(org?.name ?? "");
            }}
          />
          <NewsSourceField
            label="Source label"
            optional
            value={source}
            onChange={setSource}
            knownSources={[]}
            disabled={creating || Boolean(uploading)}
            inputClassName="h-10 w-full rounded-lg border border-border px-3 text-sm"
            hint="Optional credit under the title on the app. Leave blank to hide."
          />
          <p className="text-sm text-text-secondary">
            Author{" "}
            <span className="font-medium text-text-primary">
              {authorName || "Signed-in admin"}
            </span>
            <span className="ml-2 text-xs text-text-hint">
              · Primary media: {createMedia.label}
              {createMedia.has_soundtrack ? " + soundtrack" : ""}
            </span>
          </p>
          <NewsTikTokPreview
            title={title}
            body={body}
            organizationName={orgName}
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
            onRemoveWatermark={(options: {
              preset: NewsWatermarkPreset;
              mode: NewsWatermarkMode;
            }) =>
              void (async () => {
                if (!videoUrl.trim()) {
                  setError("Upload a video first.");
                  return;
                }
                setUploading("video");
                try {
                  const publicUrl = await removeNewsVideoWatermark(null, videoUrl, options);
                  setVideoUrl(publicUrl);
                  setPickedKind("video");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Watermark removal failed");
                } finally {
                  setUploading(null);
                }
              })()
            }
            onTrimVideo={(result) => {
              setVideoUrl(result.publicUrl);
              setPickedKind("video");
            }}
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
              disabled={statusValue === "archived"}
            />
            Feature on home
          </label>
        </form>
      </AdminModal>
    </>
  );
}
