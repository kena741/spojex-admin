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

export function newsSoundKindLabel(kind: string) {
  return NEWS_SOUND_KINDS.find((item) => item.id === kind)?.label ?? kind;
}
