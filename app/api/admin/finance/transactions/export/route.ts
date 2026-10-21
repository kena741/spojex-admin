import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission(["finance:export", "finance:read"]);
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const target = `${getSpojexApiBaseUrl()}/api/v1/admin/finance/transactions/export?${url.searchParams}`;
  const res = await fetch(target, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text || "Export failed" }, { status: res.status });
  }

  await logAdminActivity({
    context: auth.context,
    action: "finance.export",
    resource_type: "finance_transactions",
    summary: "Exported finance transactions CSV (admin proxy)",
    route: "/api/admin/finance/transactions/export",
    metadata: { query: url.search },
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="spojex-finance-transactions.csv"',
    },
  });
}
