import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

/**
 * Per-user push status / send — proxies to Spojex REST
 * `GET|POST /api/v1/push/admin/users/{user_id}`.
 */

async function proxy(request: Request, userId: string, method: "GET" | "POST") {
  const auth = await requireAdminPermission("notifications:write");
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = getSpojexApiBaseUrl();
  const url = `${base}/api/v1/push/admin/users/${userId}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  };
  if (method === "POST") {
    try {
      init.body = JSON.stringify(await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  const res = await fetch(url, init);
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = payload.detail;
    let message = "Could not complete push request";
    let clearedToken = false;
    if (typeof detail === "string") {
      message = detail;
    } else if (detail && typeof detail === "object") {
      const d = detail as { error?: string; clearedToken?: boolean };
      message = d.error || message;
      clearedToken = Boolean(d.clearedToken);
    } else if (typeof payload.error === "string") {
      message = payload.error;
      clearedToken = Boolean(payload.clearedToken);
    }
    return NextResponse.json(
      { error: message, clearedToken },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "User id is required" }, { status: 400 });
  }
  return proxy(request, id, "GET");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "User id is required" }, { status: 400 });
  }
  return proxy(request, id, "POST");
}
