import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";
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
  media_object_id?: string | null;
  is_active?: boolean;
  created_at?: string | null;
};

function normalizeUrl(raw: string) {
  return toBackendMediaUrl(raw.trim());
}

function asCatalogItem(row: Record<string, unknown>): SoundtrackCatalogItem | null {
  const source = `${row.source ?? ""}`.trim() as SoundtrackCatalogItem["source"];
  if (source !== "library" && source !== "news" && source !== "media") return null;
  const url = normalizeUrl(`${row.audio_url ?? ""}`);
  if (!url) return null;
  const key = `${row.key ?? ""}`.trim() || `${source}:${url}`;
  const soundId = row.sound_id == null ? null : `${row.sound_id}`.trim() || null;
  const mediaId =
    row.media_object_id == null ? null : `${row.media_object_id}`.trim() || null;
  return {
    key,
    name: `${row.name ?? ""}`.trim() || "Untitled sound",
    kind: `${row.kind ?? "general"}`.trim() || "general",
    audio_url: url,
    source,
    sound_id: soundId,
    media_object_id: mediaId,
    is_active: typeof row.is_active === "boolean" ? row.is_active : undefined,
    created_at: row.created_at == null ? null : `${row.created_at}`,
  };
}

/**
 * Prefer Spojex REST `/api/v1/media/audio-library` (SQL audio detection over the
 * full media inventory). Falls back to a widened local scan if the API is down.
 */
export async function GET(request: Request) {
  const auth = await requireAdminPermission("news:read");
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const source = url.searchParams.get("source")?.trim() || "all";

  const base = getSpojexApiBaseUrl();
  const token = await requestAccessToken();
  if (base && token) {
    try {
      const qs = new URLSearchParams();
      if (q) qs.set("q", q);
      if (source && source !== "all") qs.set("source", source);
      qs.set("limit", "2000");
      const upstream = await fetch(
        `${base}/api/v1/media/audio-library?${qs.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );
      const payload = (await upstream.json()) as {
        data?: Record<string, unknown>[];
        count?: number;
        sources?: Record<string, number>;
        error?: string;
        detail?: unknown;
        message?: string;
      };
      if (upstream.ok && Array.isArray(payload.data)) {
        const items = payload.data
          .map((row) => asCatalogItem(row))
          .filter((row): row is SoundtrackCatalogItem => row != null);
        return NextResponse.json({
          data: items,
          count: items.length,
          sources: payload.sources ?? null,
          via: "rest",
        });
      }
      // Fall through to local scan when REST rejects (e.g. older backend).
      if (upstream.status >= 500) {
        /* keep falling through */
      }
    } catch {
      /* local fallback */
    }
  }

  // Local fallback — still better than the old mime-only page scan.
  const client = auth.context.client;
  const items: SoundtrackCatalogItem[] = [];
  const seenUrls = new Set<string>();

  const pushUnique = (item: SoundtrackCatalogItem) => {
    const normalized = normalizeUrl(item.audio_url);
    if (!normalized || seenUrls.has(normalized)) return;
    seenUrls.add(normalized);
    items.push({ ...item, audio_url: normalized });
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
    const audioUrl = `${row.audio_url ?? ""}`.trim();
    if (!audioUrl) continue;
    pushUnique({
      key: `library:${row.id}`,
      name: row.name,
      kind: row.kind || "general",
      audio_url: audioUrl,
      source: "library",
      sound_id: row.id,
      is_active: row.is_active,
    });
  }

  const news = await client
    .from("sport_news")
    .select("id, title, audio_url, sound_id, created_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (!news.error) {
    for (const row of news.data ?? []) {
      const audioUrl = `${row.audio_url ?? ""}`.trim();
      if (!audioUrl) continue;
      const title = `${row.title ?? ""}`.trim() || "News audio";
      pushUnique({
        key: `news:${row.id}`,
        name: title,
        kind: "general",
        audio_url: audioUrl,
        source: "news",
        sound_id:
          typeof row.sound_id === "string" && row.sound_id.trim()
            ? row.sound_id
            : null,
        created_at: `${row.created_at ?? ""}` || null,
      });
    }
  }

  // Pull a wide page; detect audio by mime OR filename/path (client-side).
  const media = await client
    .from("media_objects")
    .select(
      "id, original_filename, mime_type, module, status, deleted_at, object_path, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (!media.error) {
    for (const row of media.data ?? []) {
      if (row.deleted_at) continue;
      if (`${row.status ?? ""}`.toLowerCase() !== "ready") continue;
      const mime = `${row.mime_type ?? ""}`.toLowerCase();
      const name = `${row.original_filename ?? ""}`;
      const path = `${row.object_path ?? ""}`;
      const isAudio =
        mime.startsWith("audio/") ||
        /\.(mp3|m4a|aac|wav|ogg|opus|flac|weba)$/i.test(name) ||
        /\.(mp3|m4a|aac|wav|ogg|opus|flac|weba)$/i.test(path) ||
        /\/sounds?\//i.test(path);
      if (!isAudio) continue;
      const id = `${row.id ?? ""}`.trim();
      if (!id) continue;
      pushUnique({
        key: `media:${id}`,
        name: name.replace(/\.[^.]+$/, "") || "Uploaded audio",
        kind: "general",
        audio_url: `/api/v1/media/objects/${id}/content`,
        source: "media",
        sound_id: null,
        media_object_id: id,
        created_at: `${row.created_at ?? ""}` || null,
      });
    }
  }

  let filtered = items;
  if (source !== "all") {
    filtered = filtered.filter((row) => row.source === source);
  }
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.kind.toLowerCase().includes(needle) ||
        row.source.toLowerCase().includes(needle),
    );
  }

  filtered.sort((a, b) => {
    const sourceOrder =
      { library: 0, news: 1, media: 2 }[a.source] -
      { library: 0, news: 1, media: 2 }[b.source];
    if (sourceOrder !== 0) return sourceOrder;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({
    data: filtered,
    count: filtered.length,
    via: "fallback",
  });
}
