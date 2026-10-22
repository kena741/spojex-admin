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
  for (const key of ["report_id", "message_id"]) {
    const value = incoming.searchParams.get(key);
    if (value) params.set(key, value);
  }
  return proxyRadioChat("/reports/detail", { searchParams: params });
}
