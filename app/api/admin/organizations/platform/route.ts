import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const PLATFORM_EMAIL = "platform@spojex.app";
const PLATFORM_NAME = "Spojex";

async function findAuthUserIdByEmail(client: SupabaseClient, email: string) {
  const normalized = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (hit?.id) return hit.id;
    if ((data.users?.length ?? 0) < 200) break;
  }
  return null;
}

async function ensurePublicUser(
  client: SupabaseClient,
  authUserId: string,
  opts: { email: string; displayName: string },
) {
  const { data: existing } = await client
    .from("users")
    .select("id")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (existing?.id) {
    await client
      .from("users")
      .update({
        display_name: opts.displayName,
        full_name: opts.displayName,
        email: opts.email,
        verified: true,
        role: "administrator",
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data: inserted, error } = await client
    .from("users")
    .insert({
      user_id: authUserId,
      display_name: opts.displayName,
      full_name: opts.displayName,
      email: opts.email,
      role: "administrator",
      verified: true,
      country: "Ethiopia",
      city: "Addis Ababa",
      currency: "ETB",
      bio: "Official Spojex platform account.",
    })
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id as string;
}

/** Create or return the Spojex platform organization (followable + gift recipient). */
export async function POST() {
  const auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;

  try {
    const client = createAdminClient();

    const { data: existingOrg } = await client
      .from("organizations")
      .select("*, users:user_id(id, display_name, email, role)")
      .eq("is_platform", true)
      .maybeSingle();
    if (existingOrg) {
      return NextResponse.json({ data: existingOrg, created: false });
    }

    let authUserId: string | null = null;
    const { data: created, error: createError } = await client.auth.admin.createUser({
      email: PLATFORM_EMAIL,
      password: crypto.randomUUID() + "Aa1!",
      email_confirm: true,
      user_metadata: {
        display_name: PLATFORM_NAME,
        full_name: PLATFORM_NAME,
        role: "administrator",
      },
    });

    if (created?.user?.id) {
      authUserId = created.user.id;
    } else if (createError && /already|registered|exists/i.test(createError.message)) {
      authUserId = await findAuthUserIdByEmail(client, PLATFORM_EMAIL);
      if (!authUserId) {
        return NextResponse.json(
          { error: `${createError.message}. Could not find existing platform auth user.` },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: createError?.message || "Failed to create platform login" },
        { status: 400 },
      );
    }

    const ownerUserId = await ensurePublicUser(client, authUserId, {
      email: PLATFORM_EMAIL,
      displayName: PLATFORM_NAME,
    });

    const { data: org, error: orgError } = await client
      .from("organizations")
      .insert({
        user_id: ownerUserId,
        name: PLATFORM_NAME,
        organization_type: "media_organization",
        country: "Ethiopia",
        city: "Addis Ababa",
        currency: "ETB",
        description:
          "Official Spojex platform. Follow for live matches, fights, and streams.",
        website: "https://spojex.app",
        verified: true,
        is_platform: true,
      })
      .select("*, users:user_id(id, display_name, email, role)")
      .single();

    if (orgError) {
      // Race: another request created it
      if (/organizations_one_platform|duplicate|unique/i.test(orgError.message)) {
        const { data: raced } = await client
          .from("organizations")
          .select("*, users:user_id(id, display_name, email, role)")
          .eq("is_platform", true)
          .maybeSingle();
        if (raced) return NextResponse.json({ data: raced, created: false });
      }
      const hint = missingServiceRoleMessage();
      return NextResponse.json(
        { error: hint ? `${orgError.message}. ${hint}` : orgError.message },
        { status: 400 },
      );
    }

    return NextResponse.json({ data: org, created: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create Spojex org";
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${message}. ${hint}` : message },
      { status: 400 },
    );
  }
}

export async function GET() {
  const auth = await requireAdminPermission("organizations:read");
  if (!auth.ok) return auth.error;

  const { data, error } = await auth.context.client
    .from("organizations")
    .select("*, users:user_id(id, display_name, email, role)")
    .eq("is_platform", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}
