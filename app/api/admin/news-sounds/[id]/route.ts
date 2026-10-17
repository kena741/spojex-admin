import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { NEWS_SOUND_KINDS } from "@/lib/news-sounds";

const KIND_IDS = new Set(NEWS_SOUND_KINDS.map((item) => item.id));
const allowed = [
  "name",
  "kind",
  "audio_url",
  "duration_seconds",
  "sort_order",
  "is_active",
] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if ("name" in patch) {
    const name = `${patch.name ?? ""}`.trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    patch.name = name;
  }
  if ("kind" in patch) {
    const kind = `${patch.kind ?? ""}`.trim().toLowerCase();
    if (!KIND_IDS.has(kind as (typeof NEWS_SOUND_KINDS)[number]["id"])) {
      return NextResponse.json({ error: "Invalid sound kind." }, { status: 400 });
    }
    patch.kind = kind;
  }
  if ("audio_url" in patch) {
    patch.audio_url = `${patch.audio_url ?? ""}`.trim();
  }
  if ("duration_seconds" in patch) {
    const raw = patch.duration_seconds;
    patch.duration_seconds =
      raw == null || raw === "" || Number.isNaN(Number(raw)) ? null : Number(raw);
  }
  if ("sort_order" in patch) {
    patch.sort_order = Number(patch.sort_order) || 0;
  }
  if ("is_active" in patch) {
    patch.is_active = Boolean(patch.is_active);
  }

  const { data, error } = await auth.context.client
    .from("sport_news_sounds")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const { error } = await auth.context.client.from("sport_news_sounds").delete().eq("id", id);
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
