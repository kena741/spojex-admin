import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { imageExtension, uploadViaSpojexMediaApi } from "@/lib/spojex-media";
import { stadiumPhotoUrls } from "@/lib/stadiums";
import { requestAccessToken } from "@/lib/spojex/server";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data: stadium, error: loadError } = await auth.context.client
    .from("stadiums")
    .select("id, image_url, photos")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!stadium) {
    return NextResponse.json({ error: "Stadium not found" }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const kind = `${form.get("kind") ?? "cover"}`.trim() === "gallery" ? "gallery" : "cover";
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
  const filename = `${kind}-${Date.now()}.${ext}`;

  let imageUrl: string;
  try {
    const uploaded = await uploadViaSpojexMediaApi({
      accessToken: token,
      file,
      filename,
      module: "stadiums",
      folder: "stadiums",
      kind,
    });
    if (!uploaded.publicUrl) {
      return NextResponse.json({ error: "Upload failed. No URL returned." }, { status: 400 });
    }
    imageUrl = uploaded.publicUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const photos = stadiumPhotoUrls(stadium.photos);
  if (!photos.includes(imageUrl)) {
    if (kind === "cover") photos.unshift(imageUrl);
    else photos.push(imageUrl);
  }

  const patch: Record<string, unknown> = { photos };
  if (kind === "cover" || !`${stadium.image_url ?? ""}`.trim()) {
    patch.image_url = imageUrl;
  }

  const { data, error: updateError } = await auth.context.client
    .from("stadiums")
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

  return NextResponse.json({ data, image_url: imageUrl, photos });
}
