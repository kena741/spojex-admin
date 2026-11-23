import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

async function proxy(path: string, init?: RequestInit) {
  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const res = await fetch(`${getSpojexApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  return NextResponse.json(payload, { status: res.status });
}

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.error;
  return proxy("/api/v1/admin/app-membership-plans");
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.error;
  const body = await request.json();
  return proxy("/api/v1/admin/app-membership-plans", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
