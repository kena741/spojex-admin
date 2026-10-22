import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyMediaLibrary } from "@/lib/media-library-api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission([
    "sounds:read",
    "news:read",
    "streams:read",
  ]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  return proxyMediaLibrary(`/${id}`);
}
