import { NextResponse } from "next/server";
import type { SpojexClient } from "@/lib/api/client";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { canUseAdminClient, createAdminClient } from "@/lib/spojex/admin";
import { generateStadiumManagerPassword } from "@/lib/stadiums";

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

async function ensurePublicUser(
  client: SpojexClient,
  authUserId: string,
  fields: { email: string; fullName: string; phone: string },
) {
  const { data: existing } = await client
    .from("users")
    .select("id, user_id, email, display_name, phone")
    .eq("user_id", authUserId)
    .maybeSingle();

  if (existing?.id) {
    await client
      .from("users")
      .update({
        email: fields.email,
        display_name: fields.fullName || existing.display_name,
        full_name: fields.fullName || existing.display_name,
        phone: fields.phone || existing.phone,
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data: byEmail } = await client
    .from("users")
    .select("id, user_id")
    .eq("email", fields.email)
    .maybeSingle();

  if (byEmail?.id) {
    if (byEmail.user_id && byEmail.user_id !== authUserId) {
      throw new Error("A SpoJex profile already exists for this email with a different login.");
    }
    await client
      .from("users")
      .update({
        user_id: authUserId,
        display_name: fields.fullName || undefined,
        full_name: fields.fullName || undefined,
        phone: fields.phone || undefined,
      })
      .eq("id", byEmail.id);
    return byEmail.id as string;
  }

  const { data: inserted, error } = await client
    .from("users")
    .insert({
      user_id: authUserId,
      email: fields.email,
      display_name: fields.fullName,
      full_name: fields.fullName,
      phone: fields.phone,
      role: "fan",
      country: "Ethiopia",
      currency: "ETB",
    })
    .select("id")
    .single();
  if (inserted?.id) return inserted.id as string;

  const { data: retry } = await client
    .from("users")
    .select("id")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (retry?.id) return retry.id as string;
  throw new Error(error?.message || "Failed to create SpoJex user");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const client = canUseAdminClient() ? createAdminClient() : auth.context.client;
  const { data, error } = await client
    .from("event_managers")
    .select("*, users:user_id(id, display_name, email, phone, role)")
    .eq("event_id", id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  if (!canUseAdminClient()) {
    return NextResponse.json(
      {
        error:
          missingServiceRoleMessage() ||
          "Admin API session is required to create event manager logins.",
      },
      { status: 400 },
    );
  }

  const { id: eventId } = await params;
  const body = (await request.json()) as {
    full_name?: string;
    email?: string;
    phone?: string;
    password?: string;
    manager_role?: string;
    user_id?: string;
    invite?: boolean;
    permissions?: Record<string, boolean>;
  };

  const fullName = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = (body.phone ?? "").trim();
  const password = (body.password ?? "").trim() || generateStadiumManagerPassword();
  const managerRole =
    body.manager_role === "owner"
      ? "owner"
      : body.manager_role === "scanner"
        ? "scanner"
        : "manager";
  const invite = body.invite === true;
  const defaultPermissions: Record<string, boolean> = {
    gate: true,
    attendance: true,
    tickets: managerRole !== "scanner",
    configure: managerRole === "owner" || managerRole === "manager",
    finance: managerRole === "owner",
  };
  const permissions =
    body.permissions && typeof body.permissions === "object"
      ? { ...defaultPermissions, ...body.permissions }
      : defaultPermissions;

  // Prefer assigning an existing Spojex user by user_id or email.
  if (body.user_id?.trim()) {
    const client = canUseAdminClient() ? createAdminClient() : auth.context.client;
    const { data: user } = await client
      .from("users")
      .select("id, display_name, email")
      .eq("id", body.user_id.trim())
      .maybeSingle();
    if (!user?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }
    const { data: manager, error: managerError } = await client
      .from("event_managers")
      .upsert(
        {
          event_id: eventId,
          user_id: user.id,
          manager_role: managerRole,
          is_active: true,
          login_password: "",
          permissions,
        },
        { onConflict: "event_id,user_id" },
      )
      .select("*, users:user_id(id, display_name, email, phone, role)")
      .single();
    if (managerError || !manager) {
      return NextResponse.json(
        { error: managerError?.message || "Failed to assign manager" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      data: manager,
      password: null,
      created_new_login: false,
      message:
        "Existing user assigned as event manager. Platform profile role was not changed. Passwords are not returned.",
    });
  }

  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const adminEmail = (auth.context.user.email ?? "").toLowerCase();
  if (adminEmail && email === adminEmail) {
    return NextResponse.json(
      {
        error:
          "Use a different email for the event manager. Using your admin email would reset your admin password and sign you out.",
      },
      { status: 400 },
    );
  }

  // Always use a dedicated service-role client so auth.admin calls never touch the browser session.
  const client = createAdminClient();
  const { data: event, error: eventError } = await client
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError || !event) {
    return NextResponse.json({ error: eventError?.message || "Event not found" }, { status: 404 });
  }

  // Assign existing Spojex profile by email when present (no password reset).
  const { data: existingProfile } = await client
    .from("users")
    .select("id, display_name, email")
    .ilike("email", email)
    .maybeSingle();
  if (existingProfile?.id && !invite) {
    const { data: manager, error: managerError } = await client
      .from("event_managers")
      .upsert(
        {
          event_id: eventId,
          user_id: existingProfile.id,
          manager_role: managerRole,
          is_active: true,
          login_password: "",
          permissions,
        },
        { onConflict: "event_id,user_id" },
      )
      .select("*, users:user_id(id, display_name, email, phone, role)")
      .single();
    if (managerError || !manager) {
      return NextResponse.json(
        { error: managerError?.message || "Failed to assign manager" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      data: manager,
      password: null,
      created_new_login: false,
      message:
        "Existing Spojex user assigned. Platform profile role was not changed. Passwords are not returned.",
    });
  }

  if (!fullName) {
    return NextResponse.json({ error: "full_name is required for new invites" }, { status: 400 });
  }

  let authUserId: string | null = null;
  let createdNewLogin = false;
  let inviteSent = false;

  try {
    const inviteRes = await client.auth.admin.inviteUserByEmail(email, {
      data: { display_name: fullName, full_name: fullName, role: "fan", phone },
    });
    if (inviteRes.data?.user?.id) {
      authUserId = inviteRes.data.user.id;
      createdNewLogin = true;
      inviteSent = true;
    }
  } catch {
    // Fall through to createUser without echoing password.
  }

  if (!authUserId) {
    const { data: created, error: createError } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: fullName,
        full_name: fullName,
        role: "fan",
        phone,
      },
    });

    if (created?.user?.id) {
      authUserId = created.user.id;
      createdNewLogin = true;
    } else if (createError && /already|registered|exists/i.test(createError.message)) {
      const existingAuthId = await findAuthUserIdByEmail(client, email);
      if (!existingAuthId) {
        return NextResponse.json(
          { error: `${createError.message}. Could not find the existing auth user.` },
          { status: 400 },
        );
      }
      if (existingAuthId === auth.context.user.id) {
        return NextResponse.json(
          {
            error:
              "That email belongs to your admin account. Create the manager with a different email.",
          },
          { status: 400 },
        );
      }
      authUserId = existingAuthId;
      // Do not reset password on existing accounts during assignment.
    } else {
      const message = createError?.message || "Failed to create login";
      return NextResponse.json(
        {
          error: /unauthorized|not.?admin|forbidden/i.test(message)
            ? `${message}. Confirm SPOJEX_API_BASE_URL in .env.local and restart npm run dev.`
            : message,
        },
        { status: 400 },
      );
    }
  }

  try {
    const publicUserId = await ensurePublicUser(client, authUserId, { email, fullName, phone });
    const { data: manager, error: managerError } = await client
      .from("event_managers")
      .upsert(
        {
          event_id: eventId,
          user_id: publicUserId,
          manager_role: managerRole,
          is_active: true,
          login_password: "",
          permissions,
        },
        { onConflict: "event_id,user_id" },
      )
      .select("*, users:user_id(id, display_name, email, phone, role)")
      .single();
    if (managerError || !manager) {
      return NextResponse.json(
        { error: managerError?.message || "Failed to assign manager" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      data: manager,
      password: null,
      created_new_login: createdNewLogin,
      invite_sent: inviteSent,
      message: inviteSent
        ? `Invitation sent to ${email}. Passwords are not shown in admin.`
        : `Manager linked for ${email}. Use Auth activation / password-reset - passwords are not returned.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save manager" },
      { status: 400 },
    );
  }
}
