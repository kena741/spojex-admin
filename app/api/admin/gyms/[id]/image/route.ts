import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
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

function parseKind(raw: FormDataEntryValue | null): "logo" | "cover" {
  return `${raw ?? "cover"}`.trim() === "logo" ? "logo" : "cover";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data: gym, error: loadError } = await auth.context.client
    .from("gyms")
    .select("id, logo_url, cover_url")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!gym) {
    return NextResponse.json({ error: "Gym not found" }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const kind = parseKind(form.get("kind"));
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

  const { error: uploadError } = await auth.context.client.storage.from("gyms").upload(path, bytes, {
    contentType: file.type,
    upsert: true,
    cacheControl: "3600",
  });

  if (uploadError) {
    const hint = missingServiceRoleMessage();
    const message = uploadError.message.includes("Bucket not found")
      ? `${uploadError.message}. Run supabase/migrations/112_gyms_storage.sql in Supabase.`
      : uploadError.message;
    return NextResponse.json(
      { error: hint ? `${message}. ${hint}` : message },
      { status: 400 },
    );
  }

  const { data: publicData } = auth.context.client.storage.from("gyms").getPublicUrl(path);
  const imageUrl =
    publicData.publicUrl || `${getSupabaseUrl()}/storage/v1/object/public/gyms/${path}`;

  const patch =
    kind === "logo" ? { logo_url: imageUrl } : { cover_url: imageUrl };

  const { data, error: updateError } = await auth.context.client
    .from("gyms")
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

  return NextResponse.json({
    data,
    kind,
    image_url: imageUrl,
    logo_url: kind === "logo" ? imageUrl : (data?.logo_url ?? gym.logo_url),
    cover_url: kind === "cover" ? imageUrl : (data?.cover_url ?? gym.cover_url),
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const url = new URL(request.url);
  const kind = parseKind(url.searchParams.get("kind"));
  const patch = kind === "logo" ? { logo_url: "" } : { cover_url: "" };

  const { data, error: updateError } = await auth.context.client
    .from("gyms")
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
  if (!data) {
    return NextResponse.json({ error: "Gym not found" }, { status: 404 });
  }

  return NextResponse.json({
    data,
    kind,
    logo_url: data.logo_url ?? "",
    cover_url: data.cover_url ?? "",
  });
}
