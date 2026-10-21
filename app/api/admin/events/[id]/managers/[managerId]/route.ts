import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { canUseAdminClient, createAdminClient } from "@/lib/spojex/admin";

const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  owner: { gate: true, attendance: true, tickets: true, configure: true, finance: true },
  manager: { gate: true, attendance: true, tickets: true, configure: true, finance: false },
  scanner: { gate: true, attendance: true, tickets: false, configure: false, finance: false },
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; managerId: string }> },
) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id: eventId, managerId } = await params;
  const body = (await request.json()) as {
    is_active?: boolean;
    manager_role?: string;
    permissions?: Record<string, boolean>;
    send_password_reset?: boolean;
  };

  const client = auth.context.client;
  const { data: current, error: loadError } = await client
    .from("event_managers")
    .select("id, event_id, user_id, manager_role, permissions, is_active")
    .eq("id", managerId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (loadError || !current) {
    return NextResponse.json({ error: loadError?.message || "Manager not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

  let nextRole = current.manager_role as string;
  if (
    body.manager_role === "owner" ||
    body.manager_role === "manager" ||
    body.manager_role === "scanner"
  ) {
    nextRole = body.manager_role;
    patch.manager_role = body.manager_role;
  }

  if (body.permissions && typeof body.permissions === "object") {
    const base = ROLE_DEFAULTS[nextRole] ?? ROLE_DEFAULTS.manager;
    patch.permissions = { ...base, ...body.permissions };
  } else if (patch.manager_role) {
    patch.permissions = ROLE_DEFAULTS[nextRole] ?? ROLE_DEFAULTS.manager;
  }

  let passwordResetSent = false;
  if (body.send_password_reset) {
    if (!canUseAdminClient()) {
      return NextResponse.json(
        { error: missingServiceRoleMessage() || "Service role key required to send password reset." },
        { status: 400 },
      );
    }
    const { data: profile } = await client
      .from("users")
      .select("user_id, email")
      .eq("id", current.user_id)
      .maybeSingle();
    const email = (profile?.email as string | undefined)?.trim();
    const authUserId = profile?.user_id as string | undefined;
    if (!email || !authUserId) {
      return NextResponse.json({ error: "Manager has no login email" }, { status: 400 });
    }
    if (authUserId === auth.context.user.id) {
      return NextResponse.json(
        { error: "Cannot reset the password of your own admin login from here." },
        { status: 400 },
      );
    }
    const adminClient = createAdminClient();
    const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email);
    if (resetError) return NextResponse.json({ error: resetError.message }, { status: 400 });
    passwordResetSent = true;
    patch.login_password = "";
  }

  if (Object.keys(patch).length === 0 && !passwordResetSent) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data, error } = await client
    .from("event_managers")
    .update(patch)
    .eq("id", managerId)
    .eq("event_id", eventId)
    .select("*, users:user_id(id, display_name, email, phone, role)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Audit assignment / permission changes when the audit table exists.
  try {
    await client.from("event_admin_events").insert({
      event_id: eventId,
      actor_user_id: null,
      action: typeof body.is_active === "boolean" && !body.is_active ? "manager_revoked" : "manager_updated",
      previous_state: {
        manager_role: current.manager_role,
        permissions: current.permissions,
        is_active: current.is_active,
      },
      new_state: {
        manager_role: data.manager_role,
        permissions: data.permissions,
        is_active: data.is_active,
      },
    });
  } catch {
    // Non-fatal if audit table is unavailable.
  }

  return NextResponse.json({
    data,
    password: null,
    password_reset_sent: passwordResetSent,
    message: passwordResetSent
      ? "Password reset email sent. Passwords are not returned in admin."
      : undefined,
  });
}

/**
 * Soft-revoke by default (is_active=false). Pass ?hard=1 to hard-delete the assignment row.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; managerId: string }> },
) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id: eventId, managerId } = await params;
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const client = auth.context.client;

  const { data: current } = await client
    .from("event_managers")
    .select("id, manager_role, permissions, is_active, user_id")
    .eq("id", managerId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!current) {
    return NextResponse.json({ error: "Manager not found" }, { status: 404 });
  }

  if (hard) {
    const { error } = await client
      .from("event_managers")
      .delete()
      .eq("id", managerId)
      .eq("event_id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await client
      .from("event_managers")
      .update({ is_active: false })
      .eq("id", managerId)
      .eq("event_id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  try {
    await client.from("event_admin_events").insert({
      event_id: eventId,
      actor_user_id: null,
      action: hard ? "manager_deleted" : "manager_revoked",
      previous_state: {
        manager_role: current.manager_role,
        permissions: current.permissions,
        is_active: current.is_active,
        user_id: current.user_id,
      },
      new_state: hard ? {} : { is_active: false },
    });
  } catch {
    // Non-fatal.
  }

  return NextResponse.json({ ok: true, revoked: !hard, deleted: hard });
}
