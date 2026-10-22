import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyMediaLibrary } from "@/lib/media-library-api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission(["sounds:write", "news:write"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyMediaLibrary(`/${id}/actions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
