import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { parseNewsUploadKind } from "@/lib/news-media";
import { uploadNewsMediaFromForm } from "@/lib/news-media-upload";

export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload could not start. Refresh and try again (max 50 MB for video)." },
      { status: 400 },
    );
  }

  const kind = parseNewsUploadKind(`${form.get("kind") ?? ""}`);
  const { data: article, error: loadError } = await auth.context.client
    .from("sport_news")
    .select("id, video_url, audio_url")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }
  const hasVideo = Boolean(`${article.video_url ?? ""}`.trim());
  const hasAudio = Boolean(`${article.audio_url ?? ""}`.trim());
  if (kind === "video" && hasAudio) {
    return NextResponse.json(
      { error: "Remove the audio file before uploading video." },
      { status: 400 },
    );
  }
  if (kind === "audio" && hasVideo) {
    return NextResponse.json(
      { error: "Remove the video file before uploading audio." },
      { status: 400 },
    );
  }

  return uploadNewsMediaFromForm(form, `sport-news/${id}`);
}
