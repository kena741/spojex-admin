import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyFeedInsights } from "@/lib/feed-insights-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission(["news:read", "users:read"]);
  if (!auth.ok) return auth.error;
  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["q", "page", "page_size"]) {
    const v = incoming.searchParams.get(key);
    if (v) params.set(key, v);
  }
  return proxyFeedInsights("/personalization", { searchParams: params });
}
