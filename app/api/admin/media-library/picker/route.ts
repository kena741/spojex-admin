import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyMediaLibrary } from "@/lib/media-library-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission([
    "sounds:read",
    "news:read",
    "news:write",
    "sounds:write",
  ]);
  if (!auth.ok) return auth.error;
  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["types", "organization_id", "q", "page", "page_size"]) {
    const v = incoming.searchParams.get(key);
    if (v) params.set(key, v);
  }
  return proxyMediaLibrary("/picker", { searchParams: params });
}
