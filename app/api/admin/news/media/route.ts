import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import {
  removeNewsVideoWatermarkFromForm,
  uploadNewsMediaFromForm,
} from "@/lib/news-media-upload";

export const maxDuration = 300;

/** Proxy draft news media upload to Spojex API → GCS. */
export async function POST(request: Request) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload could not start. Refresh and try again (max 50 MB for video)." },
      { status: 400 },
    );
  }

  const action = `${form.get("action") ?? ""}`.trim().toLowerCase();
  if (action === "remove-watermark") {
    return removeNewsVideoWatermarkFromForm(form, "sport-news/drafts");
  }

  return uploadNewsMediaFromForm(form, "sport-news/drafts");
}
