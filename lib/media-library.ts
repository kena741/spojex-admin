export type MediaAssetType = "image" | "video" | "sound";

export type MediaLibraryAsset = {
  id: string;
  media_type: MediaAssetType | string;
  display_name: string;
  description: string;
  sound_category: string | null;
  organization_id: string | null;
  organization_name?: string | null;
  media_object_id: string | null;
  sound_id: string | null;
  storage_key: string;
  delivery_url: string;
  mime_type: string;
  byte_size: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  status: string;
  parent_asset_id: string | null;
  attribution: string;
  created_at: string | null;
  updated_at: string | null;
  trashed_at: string | null;
  usage_count: number;
  usage_coverage?: string;
};

export type MediaLibraryListResponse = {
  assets: MediaLibraryAsset[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  counts?: { all: number; image: number; video: number; sound: number };
  limits?: MediaLimits;
  usage_note?: string;
  error?: string;
};

export type MediaLimits = {
  image: { max_bytes: number; mime_types: string[]; extensions: string[] };
  video: {
    max_bytes: number;
    mime_types: string[];
    extensions: string[];
    library_extract_max_bytes?: number;
  };
  audio: {
    max_bytes: number;
    mime_types: string[];
    extensions: string[];
    extract_from_video?: boolean;
    source_video_retained?: boolean;
    note?: string;
  };
};

export type MediaAssetDetail = {
  asset: MediaLibraryAsset;
  usages: Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    field_name: string;
    label: string;
    href: string;
    created_at: string | null;
  }>;
  usage_state: "used" | "not_used" | "unavailable";
  usage_coverage_complete: boolean;
  technical: {
    storage_key: string;
    media_object_id: string | null;
    sound_id: string | null;
    mime_type: string;
    byte_size: number | null;
    transform_metadata: Record<string, unknown>;
  };
  actions: string[];
  error?: string;
};

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "-";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || n < 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "processing":
      return "Processing";
    case "failed":
      return "Failed";
    case "hidden":
      return "Hidden";
    case "trashed":
      return "Trash";
    default:
      return status;
  }
}
