import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

const allowed = [
  "title",
  "slug",
  "summary",
  "body",
  "image_url",
  "cover_url",
  "video_url",
  "audio_url",
  "category",
  "source",
  "author",
  "status",
  "is_featured",
  "sort_order",
  "published_at",
  "organization_id",
] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if ("organization_id" in patch) {
    const raw = patch.organization_id;
    patch.organization_id =
      typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data: current } = await auth.context.client
    .from("sport_news")
    .select("video_url, audio_url")
    .eq("id", id)
    .maybeSingle();
  const currentVideo = `${current?.video_url ?? ""}`.trim();
  const currentAudio = `${current?.audio_url ?? ""}`.trim();
  const nextVideo =
    "video_url" in patch ? `${patch.video_url ?? ""}`.trim() : currentVideo;
  const nextAudio =
    "audio_url" in patch ? `${patch.audio_url ?? ""}`.trim() : currentAudio;

  if (nextVideo && nextAudio) {
    return NextResponse.json(
      { error: "A story can have video or audio, not both. Remove the current file first." },
      { status: 400 },
    );
  }
  if (currentAudio && nextVideo) {
    return NextResponse.json(
      { error: "Remove the audio file before adding video." },
      { status: 400 },
    );
  }
  if (currentVideo && nextAudio) {
    return NextResponse.json(
      { error: "Remove the video file before adding audio." },
      { status: 400 },
    );
  }
  if (nextVideo && "cover_url" in patch) {
    patch.cover_url = "";
  }

  const { data, error: updateError } = await auth.context.client
    .from("sport_news")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updateError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { error: deleteError } = await auth.context.client.from("sport_news").delete().eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
