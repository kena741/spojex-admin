import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyMediaLibrary } from "@/lib/media-library-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAnyAdminPermission(["sounds:write", "news:write"]);
  if (!auth.ok) return auth.error;
  const body = await request.json().catch(() => ({}));
  return proxyMediaLibrary("/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
