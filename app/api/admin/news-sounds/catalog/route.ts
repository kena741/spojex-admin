import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";
import type { SportNewsSoundRow } from "@/lib/news-sounds";

export type SoundtrackCatalogItem = {
  key: string;
  name: string;
  kind: string;
  audio_url: string;
  source: "library";
  sound_id: string | null;
  media_object_id?: string | null;
  is_active?: boolean;
  created_at?: string | null;
};

function normalizeUrl(raw: string) {
  return toBackendMediaUrl(raw.trim());
}

function asLibraryItem(row: Record<string, unknown>): SoundtrackCatalogItem | null {
  const url = normalizeUrl(`${row.audio_url ?? ""}`);
  if (!url) return null;
  const soundId = `${row.sound_id ?? row.id ?? ""}`.trim();
  if (!soundId) return null;
  const active = row.is_active !== false;
  if (!active) return null;
  return {
    key: `library:${soundId}`,
    name: `${row.name ?? ""}`.trim() || "Untitled sound",
    kind: `${row.kind ?? "general"}`.trim() || "general",
    audio_url: url,
    source: "library",
    sound_id: soundId,
    is_active: true,
    created_at: row.created_at == null ? null : `${row.created_at}`,
  };
}

/**
 * Curated sound library only — no news/video scrape (avoids duplicate tracks).
 */
export async function GET(request: Request) {
  const auth = await requireAdminPermission("news:read");
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const base = getSpojexApiBaseUrl();
  const token = await requestAccessToken();
  if (base && token) {
    try {
      const qs = new URLSearchParams();
      if (q) qs.set("q", q);
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
        error?: string;
      };
      if (upstream.ok && Array.isArray(payload.data)) {
        const items = payload.data
          .map((row) => asLibraryItem(row))
          .filter((row): row is SoundtrackCatalogItem => row != null);
        return NextResponse.json({
          data: items,
          count: items.length,
          sources: { library: items.length, news: 0, media: 0 },
          via: "rest",
        });
      }
    } catch {
      /* local fallback */
    }
  }

  const library = await auth.context.client
    .from("sport_news_sounds")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (library.error) {
    return NextResponse.json({ error: library.error.message }, { status: 400 });
  }

  let items: SoundtrackCatalogItem[] = [];
  for (const row of (library.data ?? []) as SportNewsSoundRow[]) {
    if (!row.is_active) continue;
    const mapped = asLibraryItem({
      id: row.id,
      sound_id: row.id,
      name: row.name,
      kind: row.kind,
      audio_url: row.audio_url,
      is_active: row.is_active,
      created_at: row.created_at,
    });
    if (mapped) items.push(mapped);
  }

  if (q) {
    items = items.filter(
      (row) =>
        row.name.toLowerCase().includes(q) || row.kind.toLowerCase().includes(q),
    );
  }

  return NextResponse.json({
    data: items,
    count: items.length,
    sources: { library: items.length, news: 0, media: 0 },
    via: "fallback",
  });
}
