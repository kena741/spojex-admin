import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyRadioChat } from "@/lib/radio-chat-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAnyAdminPermission(["streams:write", "reports:write"]);
  if (!auth.ok) return auth.error;
  const body = await request.json().catch(() => ({}));
  return proxyRadioChat("/reports/actions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
