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
  const incoming = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of ["q", "access", "plan_id", "page", "page_size"]) {
    const value = incoming.searchParams.get(key);
    if (value) qs.set(key, value);
  }

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/gyms/${id}/members?${qs}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
    } catch {
      // fall through
    }
  }

  return NextResponse.json(
    { error: "Members directory requires the Python gyms API", data: [], total: 0 },
    { status: 503 },
  );
}
