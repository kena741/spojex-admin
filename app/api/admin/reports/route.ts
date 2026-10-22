import { requireAdminPermission } from "@/lib/admin-auth";
import { proxyAdminReports } from "@/lib/reports-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminPermission("reports:read");
  if (!auth.ok) return auth.error;
  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of [
    "status",
    "target_type",
    "reason_code",
    "assigned",
    "q",
    "page",
    "page_size",
  ]) {
    const v = incoming.searchParams.get(key);
    if (v) params.set(key, v);
  }
  return proxyAdminReports("", { searchParams: params });
}
