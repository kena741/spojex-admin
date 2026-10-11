import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSupabaseUrl } from "@/lib/env";
import { newsMediaExtension, parseNewsUploadKind, validateNewsMedia } from "@/lib/news-media";

export const maxDuration = 60;

/** Signed upload for a story that has not been saved yet. */
export async function POST(request: Request) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Upload could not start. Refresh and try again." },
      { status: 400 },
    );
  }

  const kind = parseNewsUploadKind(`${body.kind ?? ""}`);
  const filename = `${body.filename ?? "file"}`;
  const contentType = `${body.contentType ?? ""}`;
  const size = Number(body.size ?? 0);
  if (!kind) {
    return NextResponse.json({ error: "kind must be image, video, or audio." }, { status: 400 });
  }
  const invalid = validateNewsMedia(kind, contentType, filename, size);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  const ext = newsMediaExtension(kind, contentType, filename);
  const path = `drafts/${crypto.randomUUID()}/${kind}-${Date.now()}.${ext}`;
  const { data: signed, error: signError } = await auth.context.client.storage
    .from("sport-news")
    .createSignedUploadUrl(path, { upsert: true });

  if (signError || !signed?.token) {
    const hint = missingServiceRoleMessage();
    const message = (signError?.message || "Could not create upload URL").includes("Bucket not found")
      ? `${signError?.message}. Run supabase/migrations/074_news_media.sql in Supabase.`
      : signError?.message || "Could not create upload URL";
    return NextResponse.json({ error: hint ? `${message}. ${hint}` : message }, { status: 400 });
  }

  const { data: publicData } = auth.context.client.storage.from("sport-news").getPublicUrl(path);
  const publicUrl =
    publicData.publicUrl || `${getSupabaseUrl()}/storage/v1/object/public/sport-news/${path}`;

  return NextResponse.json({
    kind,
    path,
    token: signed.token,
    publicUrl,
  });
}
