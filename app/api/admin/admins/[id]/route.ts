import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

async function proxyStaff(method: "PATCH" | "DELETE", id: string, body?: unknown) {
  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const base = getSpojexApiBaseUrl();
  const res = await fetch(`${base}/api/v1/admin/staff/${id}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = payload.detail;
    const message =
      typeof detail === "string"
        ? detail
        : typeof (detail as { message?: string })?.message === "string"
          ? (detail as { message: string }).message
          : typeof payload.error === "string"
            ? payload.error
            : "Request failed";
    return NextResponse.json({ error: message }, { status: res.status });
  }
  return NextResponse.json(payload);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("admins:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = await request.json();
  const result = await proxyStaff("PATCH", id, body);
  if (result.status < 400) {
    await logAdminActivity({
      context: auth.context,
      request,
      action: "update",
      resource_type: "admin",
      resource_id: id,
      summary: `Updated admin ${id}`,
      metadata: { after: body },
    });
  }
  return result;
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("admins:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  if (id === auth.context.staff.id) {
    return NextResponse.json({ error: "You cannot delete your own admin row" }, { status: 400 });
  }
  const result = await proxyStaff("DELETE", id);
  if (result.status < 400) {
    const body = (await result.clone().json().catch(() => ({}))) as {
      mode?: string;
      message?: string;
    };
    await logAdminActivity({
      context: auth.context,
      request,
      action: body.mode === "purged" ? "purge" : "delete",
      resource_type: "admin",
      resource_id: id,
      summary:
        body.mode === "purged"
          ? `Permanently removed staff row ${id}`
          : `Deactivated admin ${id}`,
      metadata: { mode: body.mode ?? "suspended", message: body.message ?? null },
    });
  }
  return result;
}
