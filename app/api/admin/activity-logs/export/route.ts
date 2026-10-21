import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

/** Separately authorized CSV export (logs:export). */
export async function GET(request: Request) {
  const auth = await requireAdminPermission("logs:export");
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const base = getSpojexApiBaseUrl();
  const res = await fetch(
    `${base}/api/v1/admin/activity-logs/export${qs ? `?${qs}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: text || "Export failed" }, { status: res.status });
  }
  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="admin-activity-logs.csv"',
    },
  });
}
