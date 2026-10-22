import { requireAdminPermission } from "@/lib/admin-auth";
import { proxyRadioChat } from "@/lib/radio-chat-api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("streams:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyRadioChat(`/stations/${id}/controls`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
