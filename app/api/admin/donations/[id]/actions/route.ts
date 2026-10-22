import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;
  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const res = await fetch(
    `${getSpojexApiBaseUrl()}/api/v1/admin/donations/${id}/actions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const bodyPayload = payload as { message?: string; error?: string };
    return NextResponse.json(
      {
        error: bodyPayload.message || bodyPayload.error || "Action failed",
        code: bodyPayload.error,
      },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}
