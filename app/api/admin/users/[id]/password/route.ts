import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

/**
 * Reset a user's login password.
 * Any signed-in admin may call this (no users:write permission required).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.error;

  const { id } = await params;
  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let password: string | undefined;
  try {
    const body = (await request.json()) as { password?: string };
    password = typeof body.password === "string" ? body.password.trim() : undefined;
  } catch {
    password = undefined;
  }

  const base = getSpojexApiBaseUrl();
  const res = await fetch(`${base}/api/v1/admin/users/${id}/reset-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(password ? { password } : {}),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    detail?: string;
    password?: string;
    email?: string;
  };
  if (!res.ok) {
    return NextResponse.json(
      { error: payload.message || payload.detail || payload.error || "Password reset failed" },
      { status: res.status },
    );
  }
  return NextResponse.json({
    ok: true,
    password: payload.password,
    email: payload.email,
  });
}
