import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const auth = await requireAdminPermission("gyms:read");
  if (!auth.ok) return auth.error;
  const { id, memberId } = await params;
  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${getSpojexApiBaseUrl()}/api/v1/admin/gyms/${id}/members/${memberId}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const body = payload as { message?: string; error?: string };
    return NextResponse.json(
      { error: body.message || body.error || "Member not found" },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}
