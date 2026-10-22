import { requireAdminPermission } from "@/lib/admin-auth";
import { proxyAdminMessages } from "@/lib/messages-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminPermission("messages:read");
  if (!auth.ok) return auth.error;
  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["q", "type", "page", "page_size"]) {
    const v = incoming.searchParams.get(key);
    if (v) params.set(key, v);
  }
  return proxyAdminMessages("/conversations", { searchParams: params });
}
