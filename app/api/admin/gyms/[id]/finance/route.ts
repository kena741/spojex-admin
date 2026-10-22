import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const days = new URL(request.url).searchParams.get("days") || "30";

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/gyms/${id}/finance?days=${encodeURIComponent(days)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
    } catch {
      // fall through
    }
  }

  return NextResponse.json(
    {
      error: "Gym finance requires the Python API",
      settlement: { available: false },
      payouts: { available: false },
    },
    { status: 503 },
  );
}
