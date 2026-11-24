import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { imageExtension, uploadViaSpojexMediaApi } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.error;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Use JPG, PNG, WebP, or GIF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
  }

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const uploaded = await uploadViaSpojexMediaApi({
      accessToken: token,
      file,
      filename: `app-member-${Date.now()}.${imageExtension(file.type, file.name)}`,
      module: "expenses",
      folder: "app-members",
    });
    if (!uploaded.publicUrl) {
      return NextResponse.json({ error: "Upload failed." }, { status: 400 });
    }
    return NextResponse.json({ url: uploaded.publicUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
