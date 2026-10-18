import { NextResponse } from "next/server";
import { getSpojexApiBaseUrl } from "@/lib/env";

/**
 * Connection push — proxies to Spojex REST `POST /api/v1/push/connections`.
 * Auth: Bearer from the mobile client (same as before).
 */
export async function POST(request: Request) {
  const base = getSpojexApiBaseUrl();
  if (!base) {
    return NextResponse.json(
      { error: "Spojex API base URL is not configured on the server." },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Missing Authorization bearer token." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const res = await fetch(`${base}/api/v1/push/connections`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(raw),
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (typeof payload.detail === "string" && payload.detail) ||
      (typeof payload.error === "string" && payload.error) ||
      "Could not send connection push";
    return NextResponse.json({ error: message }, { status: res.status });
  }
  return NextResponse.json(payload);
}
