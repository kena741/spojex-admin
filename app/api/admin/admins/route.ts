import { NextResponse } from "next/server";
import { requireAdminPermission, requireAnyAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export async function GET() {
  const auth = await requireAdminPermission("admins:read");
  if (!auth.ok) return auth.error;

  const { data, error } = await auth.context.client
    .from("admin")
    .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

/**
 * Invite staff via backend (preferred). Body: { email, full_name, role }.
 * Does not default to Super Admin - role is required and must exist.
 */
export async function POST(request: Request) {
  const auth = await requireAnyAdminPermission(["admins:invite", "admins:write"]);
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    email?: string;
    full_name?: string;
    role?: string;
    /** @deprecated direct create - prefer invitation */
    password?: string;
    is_active?: boolean;
    mode?: "invite" | "direct";
  };

  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.full_name ?? "").trim();
  const role = (body.role ?? "").trim();

  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  if (!role) return NextResponse.json({ error: "role is required" }, { status: 400 });
  if (role === "super_admin" && auth.context.staff.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only Super Admins can assign the Super Admin role" },
      { status: 403 },
    );
  }

  const mode = body.mode === "direct" ? "direct" : "invite";

  if (mode === "invite") {
    const token = await requestAccessToken();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const base = getSpojexApiBaseUrl();
    const res = await fetch(`${base}/api/v1/admin/invitations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, full_name: fullName, role }),
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
              : "Invitation failed";
      return NextResponse.json({ error: message }, { status: res.status });
    }
    await logAdminActivity({
      context: auth.context,
      request,
      action: "invite",
      resource_type: "admin_invitation",
      resource_id: String(payload.id ?? ""),
      summary: `Invited ${email} as ${role}`,
      metadata: { changes: [{ field: "role", after: role }] },
    });
    return NextResponse.json({ data: payload, mode: "invite" });
  }

  // Direct attach for existing Spojex users (legacy fallback) - always users.id
  const client = auth.context.client;
  const { data: roleRow } = await client.from("admin_role").select("slug").eq("slug", role).maybeSingle();
  if (!roleRow) return NextResponse.json({ error: `Role "${role}" does not exist` }, { status: 400 });

  const { data: existing } = await client
    .from("users")
    .select("id, user_id, email, display_name")
    .eq("email", email)
    .maybeSingle();

  if (!existing?.id) {
    return NextResponse.json(
      {
        error:
          "No SpoJex user exists with that email. Send an invitation instead, or create the account in the superapp first.",
      },
      { status: 400 },
    );
  }

  const userId = existing.id as string; // public.users.id - never auth uid

  const { data: existingStaff } = await client
    .from("admin")
    .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(20);

  const staffRows = (existingStaff ?? []) as Array<{
    id: string;
    user_id: string;
    full_name: string;
    email: string | null;
    role: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;
  const active = staffRows.find((row) => row.is_active);
  if (active) {
    return NextResponse.json(
      { error: "An active admin membership already exists for this user" },
      { status: 409 },
    );
  }

  // Reactivate oldest inactive row instead of inserting a duplicate membership.
  if (staffRows.length > 0) {
    const keep = staffRows[0];
    const now = new Date().toISOString();
    const { data: adminRow, error: updateError } = await client
      .from("admin")
      .update({
        full_name: fullName,
        email,
        role,
        is_active: body.is_active !== false,
        updated_at: now,
      })
      .eq("id", keep.id)
      .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    // Keep extras inactive (should already be).
    for (const extra of staffRows.slice(1)) {
      if (extra.is_active) {
        await client
          .from("admin")
          .update({ is_active: false, updated_at: now })
          .eq("id", extra.id);
      }
    }

    await logAdminActivity({
      context: auth.context,
      request,
      action: "restore",
      resource_type: "admin",
      resource_id: adminRow.id,
      summary: `Reactivated admin ${fullName}`,
      metadata: {
        changes: [
          { field: "email", after: email },
          { field: "role", after: role },
          { field: "is_active", after: true },
        ],
      },
    });

    return NextResponse.json({ data: adminRow, mode: "reactivated" });
  }

  const { data: adminRow, error: insertError } = await client
    .from("admin")
    .insert({
      user_id: userId,
      full_name: fullName,
      email,
      role,
      is_active: body.is_active !== false,
    })
    .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  await logAdminActivity({
    context: auth.context,
    request,
    action: "create",
    resource_type: "admin",
    resource_id: adminRow.id,
    summary: `Created admin ${fullName}`,
    metadata: {
      changes: [
        { field: "email", after: email },
        { field: "role", after: role },
      ],
    },
  });

  return NextResponse.json({ data: adminRow, mode: "direct" });
}
