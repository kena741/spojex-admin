import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyMediaLibrary } from "@/lib/media-library-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission([
    "sounds:read",
    "news:read",
    "streams:read",
  ]);
  if (!auth.ok) return auth.error;
  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of [
    "q",
    "type",
    "status",
    "organization_id",
    "sound_category",
    "date_from",
    "date_to",
    "usage",
    "page",
    "page_size",
    "sort",
    "order",
  ]) {
    const v = incoming.searchParams.get(key);
    if (v) params.set(key, v);
  }
  return proxyMediaLibrary("", { searchParams: params });
}
