import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { imageExtension, uploadViaSpojexMediaApi } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function parseKind(raw: FormDataEntryValue | null): "logo" | "cover" {
  return `${raw ?? "cover"}`.trim() === "logo" ? "logo" : "cover";
}

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function resolveMime(file: Blob, filename: string, bytes: Uint8Array): string | null {
  const declared = (file.type || "").trim().toLowerCase();
  if (ALLOWED_TYPES.has(declared)) return declared;
  const sniffed = sniffMime(bytes);
  if (sniffed) return sniffed;
  const ext = imageExtension(declared, filename).toLowerCase();
  return EXT_MIME[ext] ?? null;
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
  const raw = form.get("file");
  const kind = parseKind(form.get("kind"));
  // Accept Blob/File-like (instanceof File can fail across Node/undici realms).
  if (!(raw instanceof Blob) || typeof (raw as Blob).arrayBuffer !== "function") {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const file = raw as Blob & { name?: string };
  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const filenameHint =
    (typeof file.name === "string" && file.name.trim()) ||
    `${kind}.jpg`;
  const mime = resolveMime(file, filenameHint, bytes);
  if (!mime) {
    return NextResponse.json(
      { error: "Use a JPG, PNG, WebP, or GIF image." },
      { status: 400 },
    );
  }

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ext = imageExtension(mime, filenameHint);
  const filename = `${kind}-${Date.now()}.${ext}`;
  const uploadBlob = new Blob([bytes], { type: mime });

  let imageUrl: string;
  try {
    const uploaded = await uploadViaSpojexMediaApi({
      accessToken: token,
      file: uploadBlob,
      filename,
      module: "gyms",
      folder: "gyms",
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

  const patch = kind === "logo" ? { logo_url: imageUrl } : { cover_url: imageUrl };

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
