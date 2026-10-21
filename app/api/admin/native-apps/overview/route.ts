import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission([
    "stadiums:read",
    "gyms:read",
    "events:read",
    "donations:read",
    "streams:read",
    "analytics:read",
  ]);
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  const range = incoming.searchParams.get("range") || "30d";
  params.set("range", range);
  const start = incoming.searchParams.get("start");
  const end = incoming.searchParams.get("end");
  if (start) params.set("start", start);
  if (end) params.set("end", end);

  const res = await fetch(
    `${getSpojexApiBaseUrl()}/api/v1/admin/native-apps/overview?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = payload.detail;
    const message =
      typeof detail === "string"
        ? detail
        : typeof payload.error === "string"
          ? payload.error
          : "Failed to load Native Apps overview";
    return NextResponse.json({ error: message }, { status: res.status });
  }
  return NextResponse.json(payload);
}
