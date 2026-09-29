import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { eventPhotoUrls } from "@/lib/events";
import { getSupabaseUrl } from "@/lib/env";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extensionFor(type: string, filename: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/jpeg") return "jpg";
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "jpg";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data: event, error: loadError } = await auth.context.client
    .from("events")
    .select("id, image_url, photos")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
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

  const ext = extensionFor(file.type, file.name);
  const path = `${id}/${kind}-${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await auth.context.client.storage.from("events").upload(path, bytes, {
    contentType: file.type,
    upsert: true,
    cacheControl: "3600",
  });

  if (uploadError) {
    const hint = missingServiceRoleMessage();
    const message = uploadError.message.includes("Bucket not found")
      ? `${uploadError.message}. Run supabase/migrations/039_events_storage.sql in Supabase.`
      : uploadError.message;
    return NextResponse.json({ error: hint ? `${message}. ${hint}` : message }, { status: 400 });
  }

  const { data: publicData } = auth.context.client.storage.from("events").getPublicUrl(path);
  const imageUrl =
    publicData.publicUrl || `${getSupabaseUrl()}/storage/v1/object/public/events/${path}`;

  const photos = eventPhotoUrls(event.photos);
  if (!photos.includes(imageUrl)) {
    if (kind === "cover") photos.unshift(imageUrl);
    else photos.push(imageUrl);
  }

  const patch: Record<string, unknown> = { photos };
  if (kind === "cover" || !`${event.image_url ?? ""}`.trim()) {
    patch.image_url = imageUrl;
  }

  const { data, error: updateError } = await auth.context.client
    .from("events")
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
