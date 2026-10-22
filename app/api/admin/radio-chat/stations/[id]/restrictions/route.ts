import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyRadioChat } from "@/lib/radio-chat-api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission(["streams:write", "reports:write"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyRadioChat(`/stations/${id}/restrictions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
