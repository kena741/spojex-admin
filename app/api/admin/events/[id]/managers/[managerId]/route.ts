import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { canUseAdminClient, createAdminClient } from "@/lib/spojex/admin";
import { generateStadiumManagerPassword } from "@/lib/stadiums";

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
    password?: string;
    reset_password?: boolean;
  };

  const client = auth.context.client;
  const { data: current, error: loadError } = await client
    .from("event_managers")
    .select("id, event_id, user_id, login_password")
    .eq("id", managerId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (loadError || !current) {
    return NextResponse.json({ error: loadError?.message || "Manager not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (body.manager_role === "owner" || body.manager_role === "manager") {
    patch.manager_role = body.manager_role;
  }

  let nextPassword = current.login_password as string;
  if (body.reset_password || (body.password && body.password.trim())) {
    if (!canUseAdminClient()) {
      return NextResponse.json(
        { error: missingServiceRoleMessage() || "Service role key required to set passwords." },
        { status: 400 },
      );
    }
    nextPassword = (body.password ?? "").trim() || generateStadiumManagerPassword();
    if (nextPassword.length < 6) {
      return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 });
    }
    const { data: profile } = await client
      .from("users")
      .select("user_id")
      .eq("id", current.user_id)
      .maybeSingle();
    const authUserId = profile?.user_id as string | undefined;
    if (!authUserId) {
      return NextResponse.json({ error: "Manager has no login account" }, { status: 400 });
    }
    if (authUserId === auth.context.user.id) {
      return NextResponse.json(
        { error: "Cannot reset the password of your own admin login from here." },
        { status: 400 },
      );
    }
    const adminClient = canUseAdminClient() ? createAdminClient() : client;
    const { error: updateError } = await adminClient.auth.admin.updateUserById(authUserId, {
      password: nextPassword,
    });
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    patch.login_password = nextPassword;
  }

  const { data, error } = await client
    .from("event_managers")
    .update(patch)
    .eq("id", managerId)
    .eq("event_id", eventId)
    .select("*, users:user_id(id, display_name, email, phone, role)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data, password: nextPassword });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; managerId: string }> },
) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id: eventId, managerId } = await params;
  const { error } = await auth.context.client
    .from("event_managers")
    .delete()
    .eq("id", managerId)
    .eq("event_id", eventId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
