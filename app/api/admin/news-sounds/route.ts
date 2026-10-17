import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { NEWS_SOUND_KINDS } from "@/lib/news-sounds";

const KIND_IDS = new Set(NEWS_SOUND_KINDS.map((item) => item.id));

export async function GET() {
  const auth = await requireAdminPermission("news:read");
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

export async function POST(request: Request) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    name?: string;
    kind?: string;
    audio_url?: string;
    duration_seconds?: number | null;
    sort_order?: number;
    is_active?: boolean;
  };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const audioUrl = `${body.audio_url ?? ""}`.trim();
  if (!audioUrl) {
    return NextResponse.json({ error: "Upload a sound file first." }, { status: 400 });
  }
  const kind = `${body.kind ?? "general"}`.trim().toLowerCase();
  if (!KIND_IDS.has(kind as (typeof NEWS_SOUND_KINDS)[number]["id"])) {
    return NextResponse.json({ error: "Invalid sound kind." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const { data, error } = await auth.context.client
    .from("sport_news_sounds")
    .insert({
      name,
      kind,
      audio_url: audioUrl,
      duration_seconds:
        body.duration_seconds == null || Number.isNaN(Number(body.duration_seconds))
          ? null
          : Number(body.duration_seconds),
      sort_order: Number(body.sort_order) || 0,
      is_active: body.is_active !== false,
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
  return NextResponse.json({ data });
}
