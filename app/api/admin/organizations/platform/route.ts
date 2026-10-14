import { NextResponse } from "next/server";
import type { SpojexClient } from "@/lib/api/client";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

const PLATFORM_EMAIL = "platform@spojex.app";
const PLATFORM_NAME = "Spojex";
const PLATFORM_PUBLIC_ID = "spojex";

function errorText(err: unknown) {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "Failed to create Spojex org";
}

async function findUserIdByEmail(client: SpojexClient, email: string) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await client
    .from("users")
    .select("id, user_id, email")
    .eq("email", normalized)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

async function ensurePublicUser(
  client: SpojexClient,
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

  const byEmail = await findUserIdByEmail(client, opts.email);
  if (byEmail) return byEmail;

  const now = new Date().toISOString();
  const { data: inserted, error } = await client
    .from("users")
    .insert({
      id: authUserId,
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
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return inserted.id as string;
}

async function resolvePlatformOwnerId(client: SpojexClient) {
  const existingId = await findUserIdByEmail(client, PLATFORM_EMAIL);
  if (existingId) {
    await client
      .from("users")
      .update({
        display_name: PLATFORM_NAME,
        full_name: PLATFORM_NAME,
        verified: true,
        role: "administrator",
      })
      .eq("id", existingId);
    return existingId;
  }

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
    return ensurePublicUser(client, created.user.id, {
      email: PLATFORM_EMAIL,
      displayName: PLATFORM_NAME,
    });
  }

  if (createError && /already|registered|exists/i.test(createError.message)) {
    const again = await findUserIdByEmail(client, PLATFORM_EMAIL);
    if (again) return again;
    throw new Error(
      `${createError.message}. Could not find existing platform user (${PLATFORM_EMAIL}).`,
    );
  }

  throw new Error(createError?.message || "Failed to create platform login");
}

/** Create or return the Spojex platform organization (followable + gift recipient). */
export async function POST() {
  const auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;

  try {
    const client = auth.context.client;

    const { data: existingOrg } = await client
      .from("organizations")
      .select("*, users:user_id(id, display_name, email, role)")
      .eq("is_platform", true)
      .maybeSingle();
    if (existingOrg) {
      return NextResponse.json({ data: existingOrg, created: false });
    }

    const ownerUserId = await resolvePlatformOwnerId(client);
    const now = new Date().toISOString();

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
        public_id: PLATFORM_PUBLIC_ID,
        images: [],
        created_at: now,
        updated_at: now,
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
    const message = errorText(err);
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
