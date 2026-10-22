import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyRadioChat } from "@/lib/radio-chat-api";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission([
    "streams:read",
    "reports:read",
    "messages:read",
  ]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const incoming = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of ["before", "after"]) {
    const v = incoming.searchParams.get(key);
    if (v) qs.set(key, v);
  }
  return proxyRadioChat(`/messages/${id}/context`, { searchParams: qs });
}
