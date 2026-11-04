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

async function assignExistingManager(
  client: SpojexClient,
  stadiumId: string,
  publicUserId: string,
  managerRole: "owner" | "manager",
) {
  const { data: manager, error: managerError } = await client
    .from("stadium_managers")
    .upsert(
      {
        stadium_id: stadiumId,
        user_id: publicUserId,
        manager_role: managerRole,
        is_active: true,
        login_password: "",
      },
      { onConflict: "stadium_id,user_id" },
    )
    .select("*, users:user_id(id, display_name, email, username, phone, role)")
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
      "Existing user assigned as stadium manager. Platform profile role was not changed. Passwords are not returned.",
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("stadiums:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const client = canUseAdminClient() ? createAdminClient() : auth.context.client;
  const { data, error } = await client
    .from("stadium_managers")
    .select("*, users:user_id(id, display_name, email, username, phone, role)")
    .eq("stadium_id", id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;

  const { id: stadiumId } = await params;
  const body = (await request.json()) as {
    full_name?: string;
    email?: string;
    phone?: string;
    password?: string;
    manager_role?: string;
    user_id?: string;
    username?: string;
    /** Email or @username — preferred for assign-existing. */
    lookup?: string;
    /** When true (default if lookup/username/user_id without create), assign only. */
    assign_existing?: boolean;
    create_if_missing?: boolean;
  };

  const managerRole = body.manager_role === "owner" ? "owner" : "manager";
  const client = canUseAdminClient() ? createAdminClient() : auth.context.client;

  const { data: stadium, error: stadiumError } = await client
    .from("stadiums")
    .select("id, name")
    .eq("id", stadiumId)
    .maybeSingle();
  if (stadiumError || !stadium) {
    return NextResponse.json({ error: stadiumError?.message || "Stadium not found" }, { status: 404 });
  }

  let publicUserId = body.user_id?.trim() || "";
  const lookupRaw =
    body.lookup?.trim() || body.username?.trim() || "";
  const lookup = lookupRaw.replace(/^@+/, "");
  const isEmailLookup = lookup.includes("@");
  const emailFromLookup = isEmailLookup ? lookup.toLowerCase() : "";
  const usernameLookup = !isEmailLookup && lookup ? lookup.toLowerCase() : "";
  const wantsAssign =
    body.assign_existing === true ||
    Boolean(body.user_id?.trim()) ||
    Boolean(body.username?.trim()) ||
    Boolean(body.lookup?.trim());

  // --- Assign existing Spojex user by user_id / username / email ---
  if (wantsAssign) {
    if (!publicUserId && usernameLookup) {
      const { data: user, error: userError } = await client
        .from("users")
        .select("id, display_name, email, username")
        .ilike("username", usernameLookup)
        .maybeSingle();
      if (userError) {
        return NextResponse.json({ error: userError.message }, { status: 400 });
      }
      if (!user?.id) {
        return NextResponse.json(
          {
            error:
              "No SpoJex user found with that username. Check the spelling, or use Create manager login.",
          },
          { status: 400 },
        );
      }
      publicUserId = user.id;
    }

    if (!publicUserId && emailFromLookup) {
      const { data: user, error: userError } = await client
        .from("users")
        .select("id, display_name, email, username")
        .ilike("email", emailFromLookup)
        .maybeSingle();
      if (userError) {
        return NextResponse.json({ error: userError.message }, { status: 400 });
      }
      if (!user?.id) {
        return NextResponse.json(
          {
            error:
              "No SpoJex user found with that email. Check the spelling, or use Create manager login.",
          },
          { status: 400 },
        );
      }
      publicUserId = user.id;
    }

    if (!publicUserId) {
      return NextResponse.json(
        { error: "user_id, username, or email is required" },
        { status: 400 },
      );
    }

    const { data: user } = await client
      .from("users")
      .select("id")
      .eq("id", publicUserId)
      .maybeSingle();
    if (!user?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }
    return assignExistingManager(client, stadiumId, publicUserId, managerRole);
  }

  // --- Create / invite new manager login (existing behavior) ---
  if (!canUseAdminClient()) {
    return NextResponse.json(
      {
        error:
          missingServiceRoleMessage() ||
          "Admin API session is required to create stadium manager logins.",
      },
      { status: 400 },
    );
  }

  const fullName = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = (body.phone ?? "").trim();
  const password = (body.password ?? "").trim() || generateStadiumManagerPassword();

  if (!fullName) return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (password.length < 6) {
    return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 });
  }

  const adminEmail = (auth.context.user.email ?? "").toLowerCase();
  if (adminEmail && email === adminEmail) {
    return NextResponse.json(
      {
        error:
          "Use a different email for the stadium manager. Using your admin email would reset your admin password and sign you out.",
      },
      { status: 400 },
    );
  }

  // Always use a dedicated service-role client so auth.admin calls never touch the browser session.
  const adminClient = createAdminClient();
  let authUserId: string | null = null;
  let createdNewLogin = false;
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
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
    const existingAuthId = await findAuthUserIdByEmail(adminClient, email);
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
    const { error: updateError } = await adminClient.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
      user_metadata: { display_name: fullName, full_name: fullName, role: "fan", phone },
    });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
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

  try {
    const ensuredUserId = await ensurePublicUser(adminClient, authUserId, { email, fullName, phone });
    const { data: manager, error: managerError } = await adminClient
      .from("stadium_managers")
      .upsert(
        {
          stadium_id: stadiumId,
          user_id: ensuredUserId,
          manager_role: managerRole,
          is_active: true,
          login_password: password,
        },
        { onConflict: "stadium_id,user_id" },
      )
      .select("*, users:user_id(id, display_name, email, username, phone, role)")
      .single();
    if (managerError || !manager) {
      return NextResponse.json(
        { error: managerError?.message || "Failed to assign manager" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      data: manager,
      password,
      created_new_login: createdNewLogin,
      message: `Manager can sign in to the SpoJex app with ${email}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save manager" },
      { status: 400 },
    );
  }
}
