import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyMediaLibrary } from "@/lib/media-library-api";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAnyAdminPermission(["sounds:write", "news:write"]);
  if (!auth.ok) return auth.error;
  return proxyMediaLibrary("/backfill", { method: "POST", body: "{}" });
}
