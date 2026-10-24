import { NextResponse } from "next/server";
import type { SpojexClient } from "@/lib/api/client";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { canUseAdminClient, createAdminClient } from "@/lib/spojex/admin";
import { generateStadiumManagerPassword } from "@/lib/stadiums";

const userSelect = "id, display_name, email, username, role, phone, city, avatar_url";

/** Search public users by name, email, or username for owner/manager pickers. */
export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission([
    "users:read",
    "users:write",
    "organizations:write",
    "gyms:write",
    "gyms:read",
  ]);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const rawQ = (url.searchParams.get("q") ?? "").trim().replace(/[%(),]/g, " ");
  // Usernames may be entered with or without @.
  const q = rawQ.replace(/^@+/, "");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 12) || 12, 1), 50);

  if (q.length < 2) {
    return NextResponse.json({ data: [] });
  }

  const client = createAdminClient();
  const merged = new Map<string, Record<string, unknown>>();

  const pushRows = (rows: unknown) => {
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row !== "object") continue;
      const id = String((row as { id?: unknown }).id ?? "").trim();
      if (!id) continue;
      merged.set(id, row as Record<string, unknown>);
    }
  };

  // Exact email (server-side eq) - reliable even when the user is past the first page.
  if (q.includes("@")) {
    const email = q.toLowerCase();
    const exact = await client.from("users").select(userSelect).eq("email", email).limit(5);
    if (exact.error) {
      return NextResponse.json({ error: exact.error.message }, { status: 400 });
    }
    pushRows(exact.data);
  }

  // Exact username (without @).
  const exactUsername = await client
    .from("users")
    .select(userSelect)
    .eq("username", q.toLowerCase())
    .limit(5);
  if (!exactUsername.error) pushRows(exactUsername.data);

  // Name / partial email / username / full_name.
  const fuzzy = await client
    .from("users")
    .select(userSelect)
    .or(
      `display_name.ilike.%${q}%,email.ilike.%${q}%,full_name.ilike.%${q}%,username.ilike.%${q}%`,
    )
    .order("display_name")
    .limit(Math.max(limit, 24));
  if (fuzzy.error) {
    return NextResponse.json({ error: fuzzy.error.message }, { status: 400 });
  }
  pushRows(fuzzy.data);

  const data = [...merged.values()].slice(0, limit);
  return NextResponse.json({ data });
}

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

async function savePublicUser(
  client: SpojexClient,
  authUserId: string,
  fields: {
    email: string;
    fullName: string;
    phone: string;
    role: string;
    city: string;
    country: string;
  },
) {
  const profile = {
    email: fields.email,
    display_name: fields.fullName,
    full_name: fields.fullName,
    phone: fields.phone || null,
    role: fields.role,
    city: fields.city,
    country: fields.country || "Ethiopia",
    currency: "ETB",
  };

  const { data: existing } = await client
    .from("users")
    .select("id")
    .eq("user_id", authUserId)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await client
      .from("users")
      .update(profile)
      .eq("id", existing.id)
      .select(userSelect)
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await client
    .from("users")
    .insert({ user_id: authUserId, ...profile })
    .select(userSelect)
    .single();
  if (error) throw error;
  return data;
}

export async function POST(request: Request) {
  const auth = await requireAnyAdminPermission(["users:write", "organizations:write"]);
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    full_name?: string;
    email?: string;
    phone?: string;
    role?: string;
    city?: string;
    country?: string;
    password?: string;
  };

  const fullName = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = (body.phone ?? "").trim();
  const role = (body.role ?? "").trim().toLowerCase();
  const city = (body.city ?? "").trim();
  const country = (body.country ?? "").trim() || "Ethiopia";
  const password = (body.password ?? "").trim() || generateStadiumManagerPassword();

  if (!fullName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!/^[a-z0-9_]+$/.test(role)) {
    return NextResponse.json({ error: "Role is required" }, { status: 400 });
  }
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
          "Admin API session is required to create owner logins.",
      },
      { status: 400 },
    );
  }

  const client = createAdminClient();

  const { data: existingMatches, error: existingError } = await client
    .from("users")
    .select(userSelect)
    .ilike("email", email)
    .limit(1);
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }
  const existingProfile = existingMatches?.[0];

  if (existingProfile?.id) {
    return NextResponse.json({
      data: existingProfile,
      attached_existing: true,
    });
  }

  const metadata = {
    display_name: fullName,
    full_name: fullName,
    role,
    phone,
    city,
    country,
    currency: "ETB",
  };

  let authUserId: string | null = null;
  let createdNewLogin = false;
  const { data: created, error: createError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });

  if (created?.user?.id) {
    authUserId = created.user.id;
    createdNewLogin = true;
  } else if (createError && /already|registered|exists/i.test(createError.message)) {
    authUserId = await findAuthUserIdByEmail(client, email);
    if (!authUserId) {
      return NextResponse.json(
        { error: `${createError.message}. Could not find the existing login.` },
        { status: 400 },
      );
    }
    if (authUserId === auth.context.user.id) {
      return NextResponse.json(
        { error: "That email belongs to your admin account. Use a different email." },
        { status: 400 },
      );
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
    const profile = await savePublicUser(client, authUserId, {
      email,
      fullName,
      phone,
      role,
      city,
      country,
    });
    return NextResponse.json({
      data: profile,
      password: createdNewLogin ? password : undefined,
      attached_existing: !createdNewLogin,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save user profile";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
