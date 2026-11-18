import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyAppUpdates } from "@/lib/app-updates-server";

/** Android + iOS update settings (store info refreshes when stale or ?refresh=1). */
export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission(["settings:read", "settings:write"]);
  if (!auth.ok) return auth.error;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  return proxyAppUpdates(refresh ? "?refresh=true" : "", "GET");
}
