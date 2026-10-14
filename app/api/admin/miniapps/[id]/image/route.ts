import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { imageExtension, uploadViaSpojexMediaApi } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("miniapps:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data: app, error: loadError } = await auth.context.client
    .from("mini_apps")
    .select("id, logo_url")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!app) {
    return NextResponse.json({ error: "Mini app not found" }, { status: 404 });
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
  const filename = `logo-${Date.now()}.${ext}`;

  let logoUrl: string;
  try {
    const uploaded = await uploadViaSpojexMediaApi({
      accessToken: token,
      file,
      filename,
      module: "miniapps",
      folder: "mini-apps",
    });
    if (!uploaded.publicUrl) {
      return NextResponse.json({ error: "Upload failed. No URL returned." }, { status: 400 });
    }
    logoUrl = uploaded.publicUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data, error: updateError } = await auth.context.client
    .from("mini_apps")
    .update({ logo_url: logoUrl })
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

  return NextResponse.json({ data, logo_url: logoUrl });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("miniapps:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data, error: updateError } = await auth.context.client
    .from("mini_apps")
    .update({ logo_url: "" })
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
    return NextResponse.json({ error: "Mini app not found" }, { status: 404 });
  }

  return NextResponse.json({ data, logo_url: "" });
}
