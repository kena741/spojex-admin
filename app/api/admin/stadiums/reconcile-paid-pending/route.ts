import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const stadiumId = url.searchParams.get("stadium_id");
  const qs = stadiumId ? `?stadium_id=${encodeURIComponent(stadiumId)}` : "";

  const res = await fetch(
    `${getSpojexApiBaseUrl()}/api/v1/admin/stadiums/reconcile-paid-pending${qs}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: (payload as { error?: string }).error || "Reconcile failed" },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}
