import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

const ACCOUNT_ROLES = new Set(["fan", "athlete", "professional"]);

/**
 * Idempotent retry: sync primary `user_role_assignments` from account role
 * via backend `apply_role_resolution` (PATCH /data/users).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("users:write");
  if (!auth.ok) return auth.error;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { role?: string };
  let role = (body.role ?? "").trim().toLowerCase();

  if (!role) {
    const { data, error } = await auth.context.client
      .from("users")
      .select("role")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    role = String(data?.role ?? "").trim().toLowerCase();
  }

  if (!ACCOUNT_ROLES.has(role)) {
    return NextResponse.json(
      { error: "Account role must be fan, athlete, or professional." },
      { status: 422 },
    );
  }

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = getSpojexApiBaseUrl();
  const res = await fetch(`${base}/api/v1/data/users/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role }),
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return NextResponse.json(
      {
        error:
          (payload.message as string) ||
          (payload.detail as string) ||
          (payload.error as string) ||
          "Failed to sync role assignment",
        code: payload.code,
        assignment_pending: true,
      },
      { status: res.status },
    );
  }

  return NextResponse.json({
    ok: true,
    data: payload,
    assignment_pending: false,
  });
}
