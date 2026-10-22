import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { NEWS_SOUND_KINDS, shortSoundTitle } from "@/lib/news-sounds";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

const KIND_IDS = new Set(NEWS_SOUND_KINDS.map((item) => item.id));

function normalizeAudioUrl(raw: string) {
  const value = toBackendMediaUrl(raw.trim()) || raw.trim();
  if (!value) return "";
  const idx = value.indexOf("/api/v1/media/");
  if (idx >= 0) return value.slice(idx).replace(/\/+$/, "");
  return value.replace(/\/+$/, "");
}

export async function GET() {
  const auth = await requireAnyAdminPermission(["sounds:read", "news:read"]);
  if (!auth.ok) return auth.error;
  const { data, error } = await auth.context.client
    .from("sport_news_sounds")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}

/**
 * Add a curated library sound. Prefers backend POST /media/audio-library
 * (dedupes by audio_url). Falls back to local insert with the same dedupe.
 */
export async function POST(request: Request) {
  const auth = await requireAnyAdminPermission(["sounds:write", "news:write"]);
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    name?: string;
    kind?: string;
    audio_url?: string;
    duration_seconds?: number | null;
    sort_order?: number;
    is_active?: boolean;
  };
  const rawName = body.name?.trim() ?? "";
  if (!rawName) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const name = shortSoundTitle(rawName);
  const audioUrl = normalizeAudioUrl(`${body.audio_url ?? ""}`);
  if (!audioUrl) {
    return NextResponse.json({ error: "Upload a sound file first." }, { status: 400 });
  }
  const kind = `${body.kind ?? "general"}`.trim().toLowerCase();
  if (!KIND_IDS.has(kind as (typeof NEWS_SOUND_KINDS)[number]["id"])) {
    return NextResponse.json({ error: "Invalid sound kind." }, { status: 400 });
  }
  const durationSeconds =
    body.duration_seconds == null || Number.isNaN(Number(body.duration_seconds))
      ? null
      : Number(body.duration_seconds);
  const sortOrder = Number(body.sort_order) || 0;
  const isActive = body.is_active !== false;

  const base = getSpojexApiBaseUrl();
  const token = await requestAccessToken();
  if (base && token) {
    try {
      const upstream = await fetch(`${base}/api/v1/media/audio-library`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          kind,
          audio_url: audioUrl,
          duration_seconds: durationSeconds,
          sort_order: sortOrder,
          is_active: isActive,
        }),
        cache: "no-store",
      });
      const payload = (await upstream.json()) as {
        ok?: boolean;
        created?: boolean;
        data?: Record<string, unknown>;
        error?: string;
        detail?: unknown;
        message?: string;
      };
      if (upstream.ok && payload.data) {
        return NextResponse.json({
          data: payload.data,
          created: payload.created !== false,
        });
      }
      if (upstream.status < 500) {
        const msg =
          payload.message ||
          payload.error ||
          (typeof payload.detail === "string" ? payload.detail : null) ||
          "Could not add sound.";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    } catch {
      /* local fallback */
    }
  }

  // Local dedupe + insert when REST is unavailable.
  const existing = await auth.context.client.from("sport_news_sounds").select("*");
  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 400 });
  }
  const hit = (
    (existing.data ?? []) as Array<{
      id?: string;
      name?: string;
      kind?: string;
      audio_url?: string;
      duration_seconds?: number | null;
    }>
  ).find((row) => normalizeAudioUrl(`${row.audio_url ?? ""}`) === audioUrl);
  if (hit) {
    if (hit.id && base && token) {
      try {
        await fetch(`${base}/api/v1/admin/media-library/register`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            media_type: "sound",
            display_name: hit.name || name,
            delivery_url: audioUrl,
            sound_id: hit.id,
            duration_seconds: hit.duration_seconds ?? durationSeconds,
            sound_category: hit.kind || kind,
          }),
          cache: "no-store",
        });
      } catch {
        /* list sync recovers missing rows */
      }
    }
    return NextResponse.json({ data: hit, created: false });
  }

  const now = new Date().toISOString();
  const { data, error } = await auth.context.client
    .from("sport_news_sounds")
    .insert({
      name,
      kind,
      audio_url: audioUrl,
      duration_seconds: durationSeconds,
      sort_order: sortOrder,
      is_active: isActive,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }

  // Index into Media Library so Sound Library and Media stay aligned.
  if (data?.id && base && token) {
    try {
      await fetch(`${base}/api/v1/admin/media-library/register`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          media_type: "sound",
          display_name: name,
          delivery_url: audioUrl,
          sound_id: data.id,
          duration_seconds: durationSeconds,
          sound_category: kind,
        }),
        cache: "no-store",
      });
    } catch {
      /* list sync recovers missing rows */
    }
  }

  return NextResponse.json({ data, created: true });
}
