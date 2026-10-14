import { NextResponse } from "next/server";
import type { SpojexClient } from "@/lib/api/client";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { gymStaffRoles, type GymStaffRole } from "@/lib/gyms";
import { canUseAdminClient, createAdminClient } from "@/lib/spojex/admin";
import { generateStadiumManagerPassword } from "@/lib/stadiums";

const allowedRoles = new Set(gymStaffRoles.map((item) => item.id));

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

async function ensureFanUser(
  client: SpojexClient,
  email: string,
  fullName: string,
  password: string,
) {
  let createdNewLogin = false;
  let sharedPassword: string | null = null;
  let authUserId: string | null = null;

  const { data: existing } = await client
    .from("users")
    .select("id, user_id, display_name")
    .ilike("email", email)
    .maybeSingle();
  if (existing?.id) {
    return {
      publicUserId: existing.id as string,
      createdNewLogin: false,
      password: null as string | null,
      displayName: (existing.display_name as string) || fullName,
    };
  }

  const { data: created, error: createError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: fullName,
      full_name: fullName,
      role: "fan",
    },
  });

  if (created?.user?.id) {
    authUserId = created.user.id;
    createdNewLogin = true;
    sharedPassword = password;
  } else if (createError && /already|registered|exists/i.test(createError.message)) {
    authUserId = await findAuthUserIdByEmail(client, email);
    if (!authUserId) throw new Error(createError.message);
    await client.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
      user_metadata: { display_name: fullName, full_name: fullName, role: "fan" },
    });
    createdNewLogin = true;
    sharedPassword = password;
  } else {
    throw new Error(createError?.message || "Failed to create Fan login");
  }

  await new Promise((r) => setTimeout(r, 400));
  const { data: triggered } = await client
    .from("users")
    .select("id")
    .eq("user_id", authUserId)
    .maybeSingle();

  if (triggered?.id) {
    await client
      .from("users")
      .update({
        email,
        display_name: fullName,
        full_name: fullName,
        role: "fan",
      })
      .eq("id", triggered.id);
    return {
      publicUserId: triggered.id as string,
      createdNewLogin,
      password: sharedPassword,
      displayName: fullName,
    };
  }

  const { data: inserted, error: insertError } = await client
    .from("users")
    .insert({
      user_id: authUserId,
      email,
      display_name: fullName,
      full_name: fullName,
      role: "fan",
      country: "Ethiopia",
      currency: "ETB",
    })
    .select("id")
    .single();
  if (insertError || !inserted?.id) {
    throw new Error(insertError?.message || "Failed to create Fan profile");
  }
  return {
    publicUserId: inserted.id as string,
    createdNewLogin,
    password: sharedPassword,
    displayName: fullName,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data, error } = await auth.context.client
    .from("gym_staff")
    .select("*, users:user_id(id, display_name, email, role, phone)")
    .eq("gym_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id: gymId } = await params;

  const body = (await request.json()) as {
    user_id?: string;
    user_email?: string;
    full_name?: string;
    staff_role?: string;
    is_active?: boolean;
    password?: string;
    create_if_missing?: boolean;
  };

  let userId = body.user_id?.trim() || "";
  const userEmail = body.user_email?.trim().toLowerCase() || "";
  const fullName =
    body.full_name?.trim() ||
    (userEmail.includes("@") ? userEmail.split("@")[0] : "Staff") ||
    "Staff";
  const staffRole = (body.staff_role?.trim() || "manager") as GymStaffRole;
  const isActive = body.is_active !== false;
  const createIfMissing = body.create_if_missing !== false;
  let createdPassword: string | null = null;
  let createdNewLogin = false;

  if (!allowedRoles.has(staffRole)) {
    return NextResponse.json({ error: "Invalid staff_role" }, { status: 400 });
  }

  if (!userId && userEmail) {
    const { data: user, error: userError } = await auth.context.client
      .from("users")
      .select("id")
      .ilike("email", userEmail)
      .maybeSingle();
    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 400 });
    }
    if (user?.id) {
      userId = user.id;
    } else if (createIfMissing) {
      if (!canUseAdminClient()) {
        return NextResponse.json(
          {
            error:
              missingServiceRoleMessage() ||
              "Service role required to create a Fan account for a new email.",
          },
          { status: 400 },
        );
      }
      try {
        const password =
          (body.password ?? "").trim() || generateStadiumManagerPassword();
        const ensured = await ensureFanUser(
          createAdminClient(),
          userEmail,
          fullName,
          password,
        );
        userId = ensured.publicUserId;
        createdPassword = ensured.password;
        createdNewLogin = ensured.createdNewLogin;
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Could not create Fan account" },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "No SpoJex user found with that email." },
        { status: 400 },
      );
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "user_id or user_email is required" }, { status: 400 });
  }

  const client = canUseAdminClient() ? createAdminClient() : auth.context.client;

  const { data: gym, error: gymError } = await client
    .from("gyms")
    .select("id, owner_user_id")
    .eq("id", gymId)
    .maybeSingle();
  if (gymError) {
    return NextResponse.json({ error: gymError.message }, { status: 400 });
  }
  if (!gym) {
    return NextResponse.json({ error: "Gym not found" }, { status: 404 });
  }

  // Owners/staff should not also be members of the same gym.
  await client.from("gym_members").delete().eq("gym_id", gymId).eq("user_id", userId);

  const { data, error } = await client
    .from("gym_staff")
    .upsert(
      {
        gym_id: gymId,
        user_id: userId,
        staff_role: staffRole,
        is_active: isActive,
        ...(createdPassword ? { login_password: createdPassword } : {}),
      },
      { onConflict: "gym_id,user_id" },
    )
    .select("*, users:user_id(id, display_name, email, role, phone)")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (staffRole === "trainer" && data?.id) {
    const { data: existingTrainer } = await client
      .from("gym_trainers")
      .select("id")
      .eq("gym_id", gymId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingTrainer?.id) {
      await client
        .from("gym_trainers")
        .update({
          full_name: fullName,
          staff_id: data.id,
          is_active: true,
        })
        .eq("id", existingTrainer.id);
    } else {
      await client.from("gym_trainers").insert({
        gym_id: gymId,
        user_id: userId,
        staff_id: data.id,
        full_name: fullName,
        is_active: true,
      });
    }
  }

  if (staffRole === "owner") {
    await client
      .from("gyms")
      .update({
        owner_user_id: userId,
        owner_name:
          (data as { users?: { display_name?: string | null; email?: string | null } } | null)?.users
            ?.display_name ||
          (data as { users?: { email?: string | null } } | null)?.users?.email ||
          fullName,
      })
      .eq("id", gymId);
  }

  return NextResponse.json({
    data,
    password: createdPassword,
    created_new_login: createdNewLogin,
    message: createdNewLogin
      ? `Fan account created. Share login ${userEmail} / ${createdPassword}`
      : undefined,
  });
}
