import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyRadioChat } from "@/lib/radio-chat-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission([
    "streams:read",
    "reports:read",
    "messages:read",
  ]);
  if (!auth.ok) return auth.error;
  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  const q = incoming.searchParams.get("q");
  if (q) params.set("q", q);
  return proxyRadioChat("/stations", { searchParams: params });
}
