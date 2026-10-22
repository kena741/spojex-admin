import { requireAdminPermission } from "@/lib/admin-auth";
import { proxyAdminReports } from "@/lib/reports-api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("reports:read");
  if (!auth.ok) return auth.error;
  const { id } = await context.params;
  return proxyAdminReports(`/${encodeURIComponent(id)}`);
}
