import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { adminUsesServiceRole } from "@/lib/supabase/admin";

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

export async function POST(request: Request) {
  const auth = await requireAdminPermission("admins:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    full_name?: string;
    role?: string;
    is_active?: boolean;
  };

  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.full_name ?? "").trim();
  const role = (body.role ?? "").trim();
  const password = body.password ?? "";
  const isActive = body.is_active !== false;

  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  if (!role) return NextResponse.json({ error: "role is required" }, { status: 400 });

  const client = auth.context.client;
  const { data: roleRow } = await client.from("admin_role").select("slug").eq("slug", role).maybeSingle();
  if (!roleRow) return NextResponse.json({ error: `Role "${role}" does not exist` }, { status: 400 });

  let userId: string | null = null;

  const { data: existing } = await client
    .from("users")
    .select("user_id, email, display_name")
    .eq("email", email)
    .maybeSingle();

  if (existing?.user_id) {
    userId = existing.user_id as string;
  }

  if (!userId && adminUsesServiceRole() && password.length >= 6) {
    const { data: created, error: createError } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, display_name: fullName },
    });
    if (createError || !created.user) {
      return NextResponse.json(
        { error: createError?.message || "Failed to create auth user" },
        { status: 500 },
      );
    }
    userId = created.user.id;
  }

  if (!userId) {
    return NextResponse.json(
      {
        error:
          "No SpoJex user exists with that email. Create the account in the superapp first, or add SUPABASE_SERVICE_ROLE_KEY and a password to create one here.",
      },
      { status: 400 },
    );
  }

  const { data: adminRow, error: insertError } = await client
    .from("admin")
    .insert({
      user_id: userId,
      full_name: fullName,
      email,
      role,
      is_active: isActive,
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
        { field: "is_active", after: isActive },
      ],
    },
  });

  return NextResponse.json({ data: adminRow });
}
