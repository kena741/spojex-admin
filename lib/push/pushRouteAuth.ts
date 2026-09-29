import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  getSupabasePublishableKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/env";

export function pushEnvError() {
  if (!getSupabaseUrl() || !getSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: "Supabase service role is not configured on the server." },
      { status: 500 },
    );
  }
  return null;
}

export async function authenticatePushRequest(request: Request) {
  const envError = pushEnvError();
  if (envError) return { error: envError } as const;

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token || token.startsWith("sb_")) {
    return {
      error: NextResponse.json({ error: "Missing Authorization bearer token." }, { status: 401 }),
    } as const;
  }

  const url = getSupabaseUrl();
  const authClient = createClient(url, getSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return {
      error: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }),
    } as const;
  }

  const serviceClient = createClient(url, getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const publicId = await resolvePublicUserId(serviceClient, userData.user.id);
  if (!publicId) {
    return {
      error: NextResponse.json({ error: "No SpoJex profile for this account." }, { status: 403 }),
    } as const;
  }

  return { user: userData.user, publicUserId: publicId, serviceClient } as const;
}

export async function resolvePublicUserId(serviceClient: SupabaseClient, authUserId: string) {
  const { data: byLogin } = await serviceClient
    .from("users")
    .select("id")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (byLogin?.id) return `${byLogin.id}`;

  const { data: byPk } = await serviceClient
    .from("users")
    .select("id")
    .eq("id", authUserId)
    .maybeSingle();
  return byPk?.id ? `${byPk.id}` : null;
}

export type AuthenticatedPush = {
  user: User;
  publicUserId: string;
  serviceClient: SupabaseClient;
};
