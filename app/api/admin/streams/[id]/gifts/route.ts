import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

const PASS_THROUGH = ["page", "page_size", "from", "to", "q"] as const;

/** Gifts a radio station received (ledger + totals) from the Python admin API. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("streams:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of PASS_THROUGH) {
    const value = incoming.get(key);
    if (value) query.set(key, value);
  }

  try {
    const res = await fetch(
      `${getSpojexApiBaseUrl()}/api/v1/admin/streams/radio/${encodeURIComponent(id)}/gifts?${query}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const body = payload as { message?: string; error?: string };
      return NextResponse.json(
        { error: body.message || body.error || "Failed to load gifts" },
        { status: res.status },
      );
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Gift service unavailable" }, { status: 502 });
  }
}
