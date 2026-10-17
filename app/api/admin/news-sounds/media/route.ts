import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import {
  isNewsVideoFile,
  resolveNewsMime,
  validateLibrarySound,
} from "@/lib/news-media";
import { uploadNewsMediaFromForm } from "@/lib/news-media-upload";
import { extractAudioViaSpojexMediaApi } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

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

  const raw = form.get("file");
  if (!(raw instanceof Blob) || typeof (raw as Blob).arrayBuffer !== "function") {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const file = raw as Blob & { name?: string };
  const filenameHint =
    (typeof file.name === "string" && file.name.trim()) || "sound.bin";

  const invalid = validateLibrarySound(file.type, filenameHint, file.size);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  if (isNewsVideoFile(file.type, filenameHint)) {
    const token = await requestAccessToken();
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const mime = resolveNewsMime("video", file.type, filenameHint);
    const filename = `video-${Date.now()}.${filenameHint.match(/\.([a-z0-9]+)$/i)?.[1] || "mp4"}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploadBlob = new Blob([bytes], { type: mime });
    try {
      const uploaded = await extractAudioViaSpojexMediaApi({
        accessToken: token,
        file: uploadBlob,
        filename,
        module: "news",
        folder: "sport-news/sounds",
      });
      if (!uploaded.publicUrl) {
        return NextResponse.json({ error: "Upload failed. No URL returned." }, { status: 400 });
      }
      return NextResponse.json({
        kind: "audio",
        path: uploaded.path,
        publicUrl: uploaded.publicUrl,
        objectId: uploaded.objectId,
        durationSeconds: uploaded.durationSeconds ?? null,
        extractedFromVideo: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audio extraction failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  form.set("kind", "audio");
  return uploadNewsMediaFromForm(form, "sport-news/sounds");
}
