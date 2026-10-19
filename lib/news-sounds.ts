export const NEWS_SOUND_KINDS = [
  { id: "general", label: "General" },
  { id: "stadium", label: "Stadium" },
  { id: "crowd", label: "Crowd" },
  { id: "whistle", label: "Whistle" },
  { id: "anthem", label: "Anthem" },
  { id: "highlight", label: "Highlight" },
  { id: "training", label: "Training" },
  { id: "ambient", label: "Ambient" },
] as const;

export type NewsSoundKind = (typeof NEWS_SOUND_KINDS)[number]["id"];

export type SportNewsSoundRow = {
  id: string;
  name: string;
  kind: string;
  audio_url: string;
  duration_seconds: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** TikTok-style reusable soundtrack catalog entry (library + news + uploads). */
export type SoundtrackCatalogItem = {
  key: string;
  name: string;
  kind: string;
  audio_url: string;
  source: "library" | "news" | "media";
  sound_id: string | null;
  media_object_id?: string | null;
  is_active?: boolean;
  created_at?: string | null;
};

export const SOUNDTRACK_SOURCE_LABEL: Record<
  SoundtrackCatalogItem["source"],
  string
> = {
  library: "Library",
  news: "News audio",
  media: "Uploads",
};

export function newsSoundKindLabel(kind: string) {
  return NEWS_SOUND_KINDS.find((item) => item.id === kind)?.label ?? kind;
}

/** Normalize a sound title (strip extension / separators). No ellipsis — safe to store. */
export function shortSoundTitle(raw: string, max = 40): string {
  let value = `${raw ?? ""}`.trim().replace(/…+$/g, "").replace(/\.{2,}$/g, "");
  if (!value) return "Untitled sound";
  value = value.replace(/\.[a-z0-9]{1,8}$/i, "");
  value = value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!value) return "Untitled sound";
  if (value.length <= max) return value;
  return value.slice(0, max).trimEnd();
}

/** UI label: short title with … when truncated so long filenames don't blow the layout. */
export function displaySoundTitle(raw: string, max = 28): string {
  const cleaned = shortSoundTitle(raw, 500);
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}
