import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("admins:write");
  if (!auth.ok) return auth.error;

  const { id } = await params;
  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = typeof body.password === "string" ? body.password.trim() : "";
  } catch {
    password = "";
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const base = getSpojexApiBaseUrl();
  const res = await fetch(`${base}/api/v1/admin/staff/${id}/reset-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    detail?: string;
    email?: string;
  };
  if (!res.ok) {
    const detail = payload.detail;
    const message =
      typeof detail === "string"
        ? detail
        : typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
            ? payload.error
            : "Password reset failed";
    return NextResponse.json({ error: message }, { status: res.status });
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "update",
    resource_type: "admin",
    resource_id: id,
    summary: `Reset password for admin ${id}`,
    metadata: { email: payload.email ?? null },
  });

  return NextResponse.json({ ok: true, email: payload.email });
}
