import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { uploadNewsMediaFromForm } from "@/lib/news-media-upload";

export const maxDuration = 180;

/** Upload a library sound: audio as-is, or video → extract audio only. */
export async function POST(request: Request) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload could not start. Refresh and try again." },
      { status: 400 },
    );
  }

  // kind=audio: uploadNewsMediaFromForm extracts audio when the file is video.
  form.set("kind", "audio");
  return uploadNewsMediaFromForm(form, "sport-news/sounds");
}
