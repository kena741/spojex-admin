import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { imageExtension, uploadViaSpojexMediaApi } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermission(["events:write", "streams:write"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data: event, error: loadError } = await auth.context.client
    .from("live_events")
    .select("id, thumbnail_url")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!event) {
    return NextResponse.json({ error: "Live event not found" }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Use a JPG, PNG, WebP, or GIF image." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
  }

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ext = imageExtension(file.type, file.name);
  const filename = `thumbnail-${Date.now()}.${ext}`;

  let thumbnailUrl: string;
  try {
    const uploaded = await uploadViaSpojexMediaApi({
      accessToken: token,
      file,
      filename,
      module: "events",
      folder: "events",
      kind: "thumbnail",
    });
    if (!uploaded.publicUrl) {
      return NextResponse.json({ error: "Upload failed. No URL returned." }, { status: 400 });
    }
    thumbnailUrl = uploaded.publicUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data, error: updateError } = await auth.context.client
    .from("live_events")
    .update({ thumbnail_url: thumbnailUrl })
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

  return NextResponse.json({ data, thumbnail_url: thumbnailUrl });
}
