import { NextResponse } from "next/server";
import type { SpojexClient as SupabaseClient } from "@/lib/api/client";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { adminUsesServiceRole, createAdminClient } from "@/lib/supabase/admin";
import { generateStadiumManagerPassword } from "@/lib/stadiums";

async function findAuthUserIdByEmail(client: SupabaseClient, email: string) {
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
  client: SupabaseClient,
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
  const auth = await requireAdminPermission("stadiums:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const client = adminUsesServiceRole() ? createAdminClient() : auth.context.client;
  const { data, error } = await client
    .from("stadium_managers")
    .select("*, users:user_id(id, display_name, email, phone, role)")
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
  if (!adminUsesServiceRole()) {
    return NextResponse.json(
      {
        error:
          missingServiceRoleMessage() ||
          "Admin API session is required to create stadium manager logins.",
      },
      { status: 400 },
    );
  }

  const { id: stadiumId } = await params;
  const body = (await request.json()) as {
    full_name?: string;
    email?: string;
    phone?: string;
    password?: string;
    manager_role?: string;
  };

  const fullName = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = (body.phone ?? "").trim();
  const password = (body.password ?? "").trim() || generateStadiumManagerPassword();
  const managerRole = body.manager_role === "owner" ? "owner" : "manager";

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
  const client = createAdminClient();
  const { data: stadium, error: stadiumError } = await client
    .from("stadiums")
    .select("id, name")
    .eq("id", stadiumId)
    .maybeSingle();
  if (stadiumError || !stadium) {
    return NextResponse.json({ error: stadiumError?.message || "Stadium not found" }, { status: 404 });
  }

  let authUserId: string | null = null;
  let createdNewLogin = false;
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
    const { error: updateError } = await client.auth.admin.updateUserById(authUserId, {
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
    const publicUserId = await ensurePublicUser(client, authUserId, { email, fullName, phone });
    const { data: manager, error: managerError } = await client
      .from("stadium_managers")
      .upsert(
        {
          stadium_id: stadiumId,
          user_id: publicUserId,
          manager_role: managerRole,
          is_active: true,
          login_password: password,
        },
        { onConflict: "stadium_id,user_id" },
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
