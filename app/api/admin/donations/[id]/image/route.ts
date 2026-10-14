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

function parseKind(raw: FormDataEntryValue | string | null): "cover" | "image" {
  return `${raw ?? "cover"}`.trim() === "image" ? "image" : "cover";
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
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data: campaign, error: loadError } = await auth.context.client
    .from("donation_campaigns")
    .select("id, cover_url, image_url")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const form = await request.formData();
  const raw = form.get("file");
  const kind = parseKind(form.get("kind"));
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
    (typeof file.name === "string" && file.name.trim()) || `${kind}.jpg`;
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
      module: "donations",
      folder: "donations",
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

  const patch =
    kind === "cover"
      ? { cover_url: imageUrl, image_url: campaign.image_url || imageUrl }
      : { image_url: imageUrl };

  const { data, error: updateError } = await auth.context.client
    .from("donation_campaigns")
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
    image_url: kind === "image" ? imageUrl : (data?.image_url ?? campaign.image_url),
    cover_url: kind === "cover" ? imageUrl : (data?.cover_url ?? campaign.cover_url),
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const url = new URL(request.url);
  const kind = parseKind(url.searchParams.get("kind"));
  const patch = kind === "cover" ? { cover_url: "" } : { image_url: "" };

  const { data, error: updateError } = await auth.context.client
    .from("donation_campaigns")
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
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({
    data,
    kind,
    cover_url: data.cover_url ?? "",
    image_url: data.image_url ?? "",
  });
}
