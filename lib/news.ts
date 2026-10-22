export type NewsStatus = "draft" | "active" | "archived";

export type NewsMediaType = "text" | "image" | "gallery" | "video" | "audio";

export const newsStatuses: { id: NewsStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "active", label: "Published" },
  { id: "archived", label: "Archived" },
];

export const newsMediaTypes: { id: NewsMediaType; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "gallery", label: "Gallery" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
];

/** Normalize overview/drill-down aliases: published → active. */
export function normalizeNewsStatusFilter(raw?: string | null): NewsStatus | "all" {
  const value = String(raw || "").trim().toLowerCase();
  if (!value || value === "all") return "all";
  if (value === "published") return "active";
  if (value === "draft" || value === "active" || value === "archived") return value;
  return "all";
}

export function newsStatusMatches(rowStatus: string | null | undefined, filter: string) {
  if (!filter || filter === "all") return true;
  const row = String(rowStatus || "").toLowerCase();
  const want = normalizeNewsStatusFilter(filter);
  if (want === "all") return true;
  if (want === "active") return row === "active" || row === "published";
  return row === want;
}

export const newsCategories = [
  "General",
  "Local",
  "Premier League",
  "Academy",
  "Transfers",
  "International",
] as const;

export function newsStatusLabel(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "published" || normalized === "active") return "Published";
  return newsStatuses.find((item) => item.id === status)?.label ?? status ?? "-";
}

export function slugifyNews(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Newest published stories first. Drafts fall back to when they were created. */
export function newsRecency(row: { published_at?: string | null; created_at?: string | null }) {
  const value = row.published_at || row.created_at || "";
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Mirror of Python `admin_news.classify_media`.
 * Image/gallery + soundtrack stays image/gallery (has_soundtrack), never Audio.
 */
export function classifyNewsMedia(input: {
  video_url?: string | null;
  audio_url?: string | null;
  sound_id?: string | null;
  image_url?: string | null;
  cover_url?: string | null;
  image_urls?: unknown;
}): { media_type: NewsMediaType; has_soundtrack: boolean; label: string } {
  const video = `${input.video_url ?? ""}`.trim();
  const audio = `${input.audio_url ?? ""}`.trim();
  const hasSoundId = Boolean(`${input.sound_id ?? ""}`.trim());
  const urls: string[] = [];
  if (Array.isArray(input.image_urls)) {
    for (const item of input.image_urls) {
      const url = `${item ?? ""}`.trim();
      if (url) urls.push(url);
    }
  }
  const primary = `${input.image_url ?? ""}`.trim() || `${input.cover_url ?? ""}`.trim();
  if (primary && !urls.includes(primary)) urls.unshift(primary);
  const hasImage = urls.length > 0 || Boolean(primary);

  if (video) return { media_type: "video", has_soundtrack: false, label: "Video" };
  if (hasImage) {
    const media_type: NewsMediaType = urls.length > 1 ? "gallery" : "image";
    return {
      media_type,
      has_soundtrack: Boolean(audio || hasSoundId),
      label: media_type === "gallery" ? "Gallery" : "Image",
    };
  }
  if (audio || hasSoundId) {
    return { media_type: "audio", has_soundtrack: false, label: "Audio" };
  }
  return { media_type: "text", has_soundtrack: false, label: "Text" };
}

export type NewsDirectoryRow = {
  id: string;
  title: string;
  slug?: string | null;
  summary?: string | null;
  category?: string | null;
  source?: string | null;
  author?: string | null;
  status: string;
  status_label?: string;
  is_featured?: boolean;
  featured_label?: string;
  media_type: NewsMediaType | string;
  media_label?: string;
  has_soundtrack?: boolean;
  thumbnail?: string | null;
  organization_id?: string | null;
  organization_name?: string | null;
  organization_logo?: string | null;
  engagement?: {
    likes?: number;
    comments?: number;
    saves?: number;
    shares?: number;
  };
  display_date?: {
    label?: string;
    at?: string | null;
    first_published_at?: string | null;
  };
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  archived_at?: string | null;
  href?: string;
};

export type NewsDirectoryResponse = {
  data: NewsDirectoryRow[];
  total: number;
  page: number;
  page_size: number;
  filtered_total?: number;
  totals?: {
    draft?: number;
    published?: number;
    archived?: number;
    featured?: number;
    all?: number;
  };
  filters?: {
    organizations?: Array<{ id: string; name: string }>;
    categories?: string[];
    media_types?: Array<{ id: string; label: string }>;
    statuses?: Array<{ id: string; label: string }>;
    placements?: Array<{ id: string; label: string }>;
  };
};
