import { NextResponse } from "next/server";
import type { SpojexClient } from "@/lib/api/client";
import { requireAdminPermission, requireAnyAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { canUseAdminClient, createAdminClient } from "@/lib/spojex/admin";
import { requestAccessToken } from "@/lib/spojex/server";
import { generateStadiumManagerPassword } from "@/lib/stadiums";

type StaffRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

async function findAuthUserIdByEmail(client: SpojexClient, email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => (user.email ?? "").toLowerCase() === target);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureStaffMembership(
  client: SpojexClient,
  opts: {
    userId: string;
    fullName: string;
    email: string;
    role: string;
  },
): Promise<{ row: StaffRow; mode: "created" | "reactivated" }> {
  const { data: existingStaff } = await client
    .from("admin")
    .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
    .eq("user_id", opts.userId)
    .order("created_at", { ascending: true })
    .limit(20);

  const staffRows = (existingStaff ?? []) as StaffRow[];
  const active = staffRows.find((row) => row.is_active);
  if (active) {
    throw new Error("An active admin membership already exists for this user");
  }

  const now = new Date().toISOString();
  if (staffRows.length > 0) {
    const keep = staffRows[0];
    const { data: adminRow, error: updateError } = await client
      .from("admin")
      .update({
        full_name: opts.fullName,
        email: opts.email,
        role: opts.role,
        is_active: true,
        updated_at: now,
      })
      .eq("id", keep.id)
      .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
      .single();
    if (updateError) throw new Error(updateError.message);
    for (const extra of staffRows.slice(1)) {
      if (extra.is_active) {
        await client
          .from("admin")
          .update({ is_active: false, updated_at: now })
          .eq("id", extra.id);
      }
    }
    return { row: adminRow as StaffRow, mode: "reactivated" };
  }

  const { data: adminRow, error: insertError } = await client
    .from("admin")
    .insert({
      user_id: opts.userId,
      full_name: opts.fullName,
      email: opts.email,
      role: opts.role,
      is_active: true,
    })
    .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
    .single();
  if (insertError) throw new Error(insertError.message);
  return { row: adminRow as StaffRow, mode: "created" };
}

export async function GET(request: Request) {
  const auth = await requireAdminPermission("admins:read");
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().replace(/[%(),]/g, " ");

  // Staff directory
  if (!q) {
    const { data, error } = await auth.context.client
      .from("admin")
      .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  // User picker for "add existing" — email, username, or name
  if (q.length < 2) return NextResponse.json({ users: [] });

  const client = canUseAdminClient() ? createAdminClient() : auth.context.client;
  const merged = new Map<string, Record<string, unknown>>();
  const push = (rows: unknown) => {
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row !== "object") continue;
      const id = String((row as { id?: unknown }).id ?? "").trim();
      if (id) merged.set(id, row as Record<string, unknown>);
    }
  };

  if (q.includes("@")) {
    const exact = await client
      .from("users")
      .select("id, display_name, full_name, email, username, role, avatar_url")
      .eq("email", q.toLowerCase())
      .limit(5);
    if (!exact.error) push(exact.data);
  }

  const fuzzy = await client
    .from("users")
    .select("id, display_name, full_name, email, username, role, avatar_url")
    .or(
      `display_name.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%,username.ilike.%${q}%`,
    )
    .order("display_name")
    .limit(24);
  if (fuzzy.error) {
    return NextResponse.json({ error: fuzzy.error.message }, { status: 400 });
  }
  push(fuzzy.data);

  return NextResponse.json({ users: [...merged.values()].slice(0, 12) });
}

/**
 * Create / attach / invite staff.
 * mode=create — new login + password (returned once for copy)
 * mode=attach — existing user by email / username / user_id
 * mode=invite — shareable invite link (optional)
 */
export async function POST(request: Request) {
  const auth = await requireAnyAdminPermission(["admins:invite", "admins:write"]);
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    email?: string;
    full_name?: string;
    role?: string;
    password?: string;
    username?: string;
    user_id?: string;
    mode?: "invite" | "create" | "attach" | "direct";
  };

  const role = (body.role ?? "").trim();
  if (!role) return NextResponse.json({ error: "Staff role is required" }, { status: 400 });
  if (role === "super_admin" && auth.context.staff.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only Super Admins can assign the Super Admin role" },
      { status: 403 },
    );
  }

  const mode =
    body.mode === "create"
      ? "create"
      : body.mode === "attach" || body.mode === "direct"
        ? "attach"
        : body.mode === "invite"
          ? "invite"
          : "create";

  const client = canUseAdminClient() ? createAdminClient() : auth.context.client;
  const { data: roleRow } = await client
    .from("admin_role")
    .select("slug")
    .eq("slug", role)
    .maybeSingle();
  if (!roleRow) {
    return NextResponse.json({ error: `Role "${role}" does not exist` }, { status: 400 });
  }

  // ── Invite link (optional) ──────────────────────────────────────────────
  if (mode === "invite") {
    const email = (body.email ?? "").trim().toLowerCase();
    const fullName = (body.full_name ?? "").trim();
    if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
    if (!fullName) return NextResponse.json({ error: "full_name is required" }, { status: 400 });

    const token = await requestAccessToken();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const res = await fetch(`${getSpojexApiBaseUrl()}/api/v1/admin/invitations`, {
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

  // ── Attach existing account ─────────────────────────────────────────────
  if (mode === "attach") {
    const email = (body.email ?? "").trim().toLowerCase();
    const username = (body.username ?? "").trim().replace(/^@/, "");
    const userIdHint = (body.user_id ?? "").trim();

    let existing: {
      id: string;
      email: string | null;
      display_name: string | null;
      full_name: string | null;
      username?: string | null;
    } | null = null;

    if (userIdHint) {
      const { data } = await client
        .from("users")
        .select("id, email, display_name, full_name, username")
        .eq("id", userIdHint)
        .maybeSingle();
      existing = data;
    } else if (email) {
      const { data } = await client
        .from("users")
        .select("id, email, display_name, full_name, username")
        .eq("email", email)
        .maybeSingle();
      existing = data;
    } else if (username) {
      const { data } = await client
        .from("users")
        .select("id, email, display_name, full_name, username")
        .ilike("username", username)
        .limit(1)
        .maybeSingle();
      existing = data;
    }

    if (!existing?.id) {
      return NextResponse.json(
        {
          error:
            "No SpoJex user found. Search by email or username, or create a new staff login.",
        },
        { status: 404 },
      );
    }

    const fullName =
      (body.full_name ?? "").trim() ||
      existing.display_name ||
      existing.full_name ||
      existing.email ||
      "Staff";
    const staffEmail = (existing.email || email || "").toLowerCase();
    if (!staffEmail) {
      return NextResponse.json(
        { error: "That user has no email on file. Add an email on their profile first." },
        { status: 400 },
      );
    }

    try {
      const { row, mode: staffMode } = await ensureStaffMembership(client, {
        userId: existing.id,
        fullName,
        email: staffEmail,
        role,
      });
      await logAdminActivity({
        context: auth.context,
        request,
        action: staffMode === "reactivated" ? "restore" : "create",
        resource_type: "admin",
        resource_id: row.id,
        summary:
          staffMode === "reactivated"
            ? `Reactivated admin ${fullName}`
            : `Attached admin role to ${fullName}`,
        metadata: {
          changes: [
            { field: "email", after: staffEmail },
            { field: "role", after: role },
          ],
          user_id: existing.id,
        },
      });
      return NextResponse.json({
        data: row,
        mode: staffMode === "reactivated" ? "reactivated" : "attached",
        password: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Attach failed";
      const status = /already exists/i.test(message) ? 409 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  }

  // ── Create new staff login + password ───────────────────────────────────
  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.full_name ?? "").trim();
  const password = (body.password ?? "").trim() || generateStadiumManagerPassword();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!fullName) return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const adminEmail = (auth.context.user.email ?? "").toLowerCase();
  if (adminEmail && email === adminEmail) {
    return NextResponse.json(
      { error: "Use a different email. This one belongs to your admin account." },
      { status: 400 },
    );
  }

  if (!canUseAdminClient()) {
    return NextResponse.json(
      {
        error:
          missingServiceRoleMessage() ||
          "Admin API credentials are required to create staff logins.",
      },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  // If profile already exists, attach instead of creating a second login.
  const { data: existingProfile } = await adminClient
    .from("users")
    .select("id, email, display_name, full_name")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile?.id) {
    try {
      const { row, mode: staffMode } = await ensureStaffMembership(adminClient, {
        userId: existingProfile.id,
        fullName:
          fullName ||
          existingProfile.display_name ||
          existingProfile.full_name ||
          email,
        email,
        role,
      });
      await logAdminActivity({
        context: auth.context,
        request,
        action: staffMode === "reactivated" ? "restore" : "create",
        resource_type: "admin",
        resource_id: row.id,
        summary: `Attached admin role to existing user ${email}`,
        metadata: { role, user_id: existingProfile.id },
      });
      return NextResponse.json({
        data: row,
        mode: "attached_existing",
        password: null,
        message:
          "That email already has a SpoJex account. Staff access was granted; no new password was set.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Attach failed";
      return NextResponse.json(
        { error: message },
        { status: /already exists/i.test(message) ? 409 : 400 },
      );
    }
  }

  let authUserId: string | null = null;
  let createdNewLogin = false;
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: fullName,
      full_name: fullName,
      role: "administrator",
    },
  });

  if (created?.user?.id) {
    authUserId = created.user.id;
    createdNewLogin = true;
  } else if (createError && /already|registered|exists/i.test(createError.message)) {
    authUserId = await findAuthUserIdByEmail(adminClient, email);
    if (!authUserId) {
      return NextResponse.json(
        { error: `${createError.message}. Could not find the existing login.` },
        { status: 400 },
      );
    }
  } else {
    return NextResponse.json(
      { error: createError?.message || "Failed to create login" },
      { status: 400 },
    );
  }

  const { data: byAuth } = await adminClient
    .from("users")
    .select("id")
    .eq("user_id", authUserId)
    .maybeSingle();

  let publicUserId = byAuth?.id as string | undefined;
  if (!publicUserId) {
    const { data: inserted, error: insertUserError } = await adminClient
      .from("users")
      .insert({
        user_id: authUserId,
        email,
        display_name: fullName,
        full_name: fullName,
        role: "administrator",
        country: "Ethiopia",
        currency: "ETB",
      })
      .select("id")
      .single();
    if (insertUserError) {
      return NextResponse.json({ error: insertUserError.message }, { status: 400 });
    }
    publicUserId = inserted.id as string;
  }

  if (!publicUserId) {
    return NextResponse.json({ error: "Failed to resolve user profile" }, { status: 400 });
  }

  try {
    const { row, mode: staffMode } = await ensureStaffMembership(adminClient, {
      userId: publicUserId,
      fullName,
      email,
      role,
    });
    await logAdminActivity({
      context: auth.context,
      request,
      action: "create",
      resource_type: "admin",
      resource_id: row.id,
      summary: `Created staff ${fullName} (${role})`,
      metadata: {
        changes: [
          { field: "email", after: email },
          { field: "role", after: role },
        ],
        login_created: createdNewLogin,
      },
    });
    return NextResponse.json({
      data: row,
      mode: staffMode === "reactivated" ? "reactivated" : "created",
      password: createdNewLogin ? password : null,
      message: createdNewLogin
        ? "Staff account created. Copy the email and password now — the password is shown only once."
        : "Staff access granted on an existing login. No new password was set.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create staff";
    return NextResponse.json(
      { error: message },
      { status: /already exists/i.test(message) ? 409 : 400 },
    );
  }
}
