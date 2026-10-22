import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission(["finance:read", "wallets:read"]);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: "Backend unavailable", code: "unavailable" },
      { status: 503 },
    );
  }

  try {
    const target = `${getSpojexApiBaseUrl()}/api/v1/admin/finance/reconciliation?${url.searchParams}`;
    const res = await fetch(target, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            (typeof payload.message === "string" && payload.message) ||
            (typeof payload.error === "string" && payload.error) ||
            "Failed to load reconciliation",
        },
        { status: res.status },
      );
    }
    return NextResponse.json({ ...payload, source: "python" });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load reconciliation",
        code: "api_error",
      },
      { status: 500 },
    );
  }
}
