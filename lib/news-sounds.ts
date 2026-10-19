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

/** Short display / storage title for library sounds (filenames can be very long). */
export function shortSoundTitle(raw: string, max = 48): string {
  let value = `${raw ?? ""}`.trim();
  if (!value) return "Untitled sound";
  value = value.replace(/\.[a-z0-9]{1,8}$/i, "");
  value = value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!value) return "Untitled sound";
  if (value.length <= max) return value;
  return value.slice(0, max).trimEnd();
}
