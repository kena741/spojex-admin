import { requireAdminPermission } from "@/lib/admin-auth";
import { proxyAdminMessages } from "@/lib/messages-api";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("messages:read");
  if (!auth.ok) return auth.error;
  const { id } = await context.params;
  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["before", "limit"]) {
    const v = incoming.searchParams.get(key);
    if (v) params.set(key, v);
  }
  return proxyAdminMessages(`/conversations/${encodeURIComponent(id)}`, {
    searchParams: params,
  });
}
