import { requireAdminPermission } from "@/lib/admin-auth";
import { proxyAdminReports } from "@/lib/reports-api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("reports:write");
  if (!auth.ok) return auth.error;
  const { id } = await context.params;
  const body = await request.text();
  return proxyAdminReports(`/${encodeURIComponent(id)}/decisions`, {
    method: "POST",
    body,
  });
}
