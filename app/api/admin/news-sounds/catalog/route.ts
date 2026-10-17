import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import type { SportNewsSoundRow } from "@/lib/news-sounds";

export type SoundtrackCatalogItem = {
  /** Stable key for UI selection. */
  key: string;
  name: string;
  kind: string;
  audio_url: string;
  source: "library" | "news" | "media";
  /** Library row id when source is library (or after promote). */
  sound_id: string | null;
  is_active?: boolean;
};

function normalizeUrl(raw: string) {
  return toBackendMediaUrl(raw.trim());
}

/**
 * All Spojex audio usable as an image soundtrack:
 * sound library + news audio_url tracks + news-module media objects.
 */
export async function GET() {
  const auth = await requireAdminPermission("news:read");
  if (!auth.ok) return auth.error;
  const client = auth.context.client;
  const items: SoundtrackCatalogItem[] = [];
  const seenUrls = new Set<string>();

  const pushUnique = (item: SoundtrackCatalogItem) => {
    const url = normalizeUrl(item.audio_url);
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    items.push({ ...item, audio_url: url });
  };

  const library = await client
    .from("sport_news_sounds")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (library.error) {
    return NextResponse.json({ error: library.error.message }, { status: 400 });
  }
  for (const row of (library.data ?? []) as SportNewsSoundRow[]) {
    if (!row.is_active) continue;
    const url = `${row.audio_url ?? ""}`.trim();
    if (!url) continue;
    pushUnique({
      key: `library:${row.id}`,
      name: row.name,
      kind: row.kind || "general",
      audio_url: url,
      source: "library",
      sound_id: row.id,
      is_active: row.is_active,
    });
  }

  const news = await client
    .from("sport_news")
    .select("id, title, audio_url, sound_id")
    .neq("audio_url", "")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (!news.error) {
    for (const row of news.data ?? []) {
      const url = `${row.audio_url ?? ""}`.trim();
      if (!url) continue;
      const title = `${row.title ?? ""}`.trim() || "News audio";
      pushUnique({
        key: `news:${row.id}`,
        name: title,
        kind: "general",
        audio_url: url,
        source: "news",
        sound_id: typeof row.sound_id === "string" && row.sound_id.trim() ? row.sound_id : null,
      });
    }
  }

  // GCS inventory for news-module audio uploads.
  const media = await client
    .from("media_objects")
    .select("id, original_filename, mime_type, module, status, deleted_at")
    .eq("module", "news")
    .ilike("mime_type", "audio/%")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (!media.error) {
    for (const row of media.data ?? []) {
      if (`${row.status ?? ""}`.toLowerCase() === "deleted") continue;
      const id = `${row.id ?? ""}`.trim();
      if (!id) continue;
      const url = `/api/v1/media/objects/${id}/content`;
      const name =
        `${row.original_filename ?? ""}`.trim().replace(/\.[^.]+$/, "") || "Uploaded audio";
      pushUnique({
        key: `media:${id}`,
        name,
        kind: "general",
        audio_url: url,
        source: "media",
        sound_id: null,
      });
    }
  }

  items.sort((a, b) => {
    const sourceOrder = { library: 0, news: 1, media: 2 }[a.source] -
      { library: 0, news: 1, media: 2 }[b.source];
    if (sourceOrder !== 0) return sourceOrder;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ data: items, count: items.length });
}
