import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("news:read");
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const res = await fetch(
    `${getSpojexApiBaseUrl()}/api/v1/admin/news/${id}/workspace`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      {
        error:
          (payload as { error?: string; message?: string }).error ||
          (payload as { message?: string }).message ||
          "Failed to load article",
      },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}
