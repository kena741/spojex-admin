import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyFeedInsights } from "@/lib/feed-insights-api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission(["news:read", "users:read"]);
  if (!auth.ok) return auth.error;
  const { id } = await context.params;
  return proxyFeedInsights(`/users/${encodeURIComponent(id)}`);
}
