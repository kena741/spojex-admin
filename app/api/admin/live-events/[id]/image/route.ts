import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
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

  const ext = extensionFor(file.type, file.name);
  const path = `live-events/${id}/thumbnail-${Date.now()}.${ext}`;
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
  const thumbnailUrl =
    publicData.publicUrl || `${getSupabaseUrl()}/storage/v1/object/public/events/${path}`;

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
