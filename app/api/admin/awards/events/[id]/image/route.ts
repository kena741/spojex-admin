import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { imageExtension, uploadViaSpojexMediaApi } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function parseKind(raw: FormDataEntryValue | string | null): "cover" | "banner" {
  return `${raw ?? "cover"}`.trim() === "banner" ? "banner" : "cover";
}

function apiErrorMessage(payload: Record<string, unknown>, fallback: string) {
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const message = (detail as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  return fallback;
}

async function patchAwardEvent(token: string, eventId: string, patch: Record<string, string>) {
  const res = await fetch(`${getSpojexApiBaseUrl()}/api/v1/admin/awards/events/${eventId}`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, "Failed to update award event image"));
  }
  return payload;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("awards:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

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
  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
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
      module: "awards",
      folder: kind === "banner" ? "award-banners" : "award-covers",
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

  try {
    const data = await patchAwardEvent(
      token,
      id,
      kind === "banner" ? { banner_url: imageUrl } : { cover_url: imageUrl },
    );
    return NextResponse.json({
      data,
      kind,
      cover_url: kind === "cover" ? imageUrl : String(data.cover_url ?? ""),
      banner_url: kind === "banner" ? imageUrl : String(data.banner_url ?? ""),
      image_url: imageUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save image URL" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("awards:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const kind = parseKind(new URL(request.url).searchParams.get("kind"));

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const data = await patchAwardEvent(
      token,
      id,
      kind === "banner" ? { banner_url: "" } : { cover_url: "" },
    );
    return NextResponse.json({
      data,
      kind,
      cover_url: String(data.cover_url ?? ""),
      banner_url: String(data.banner_url ?? ""),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove image" },
      { status: 400 },
    );
  }
}
