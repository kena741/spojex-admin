import { NextResponse } from "next/server";
import {
  createSpojexClient,
  type SpojexClient,
  type SpojexUser,
} from "@/lib/api/client";
import { getSpojexApiBaseUrl } from "@/lib/env";

export function pushEnvError() {
  if (!getSpojexApiBaseUrl()) {
    return NextResponse.json(
      { error: "Spojex API base URL is not configured on the server." },
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

  const authClient = createSpojexClient({
    getSession: () => ({
      access_token: token,
      refresh_token: "",
      token_type: "bearer",
      user: { id: "", aud: "authenticated", user_metadata: {}, app_metadata: {} },
    }),
    saveSession: () => undefined,
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user?.id) {
    return {
      error: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }),
    } as const;
  }

  const publicId = await resolvePublicUserId(authClient, userData.user.id);
  if (!publicId) {
    return {
      error: NextResponse.json({ error: "No SpoJex profile for this account." }, { status: 403 }),
    } as const;
  }

  return { user: userData.user, publicUserId: publicId, serviceClient: authClient } as const;
}

export async function resolvePublicUserId(serviceClient: SpojexClient, authUserId: string) {
  const { data: byLogin } = await serviceClient
    .from("users")
    .select("id")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (byLogin && typeof byLogin === "object" && "id" in byLogin && byLogin.id) {
    return `${byLogin.id}`;
  }

  const { data: byPk } = await serviceClient
    .from("users")
    .select("id")
    .eq("id", authUserId)
    .maybeSingle();
  if (byPk && typeof byPk === "object" && "id" in byPk && byPk.id) {
    return `${byPk.id}`;
  }
  return null;
}

export type AuthenticatedPush = {
  user: SpojexUser;
  publicUserId: string;
  serviceClient: SpojexClient;
};
