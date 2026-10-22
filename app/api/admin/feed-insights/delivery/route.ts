import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyFeedInsights } from "@/lib/feed-insights-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAnyAdminPermission([
    "news:read",
    "users:read",
    "analytics:read",
  ]);
  if (!auth.ok) return auth.error;
  return proxyFeedInsights("/delivery");
}
