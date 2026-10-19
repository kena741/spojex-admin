import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

export const maxDuration = 120;

/**
 * Same-origin stream of an uploaded news video so the in-browser editor
 * (@elah/editor) can import it without CORS issues.
 */
export async function GET(request: Request) {
  const auth = await requireAdminPermission("news:write");
  if (!auth.ok) return auth.error;

  const raw = new URL(request.url).searchParams.get("url")?.trim() || "";
  if (!raw) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const fetchUrl = toBackendMediaUrl(raw);
  let upstream: Response;
  try {
    upstream = await fetch(fetchUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "*/*",
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Could not download video." }, { status: 400 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Could not download video (${upstream.status}).` },
      { status: 400 },
    );
  }

  const contentType =
    upstream.headers.get("content-type")?.split(";")[0].trim() || "video/mp4";
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
    },
  });
}
