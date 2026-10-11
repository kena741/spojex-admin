import { cookies, headers } from "next/headers";
import {
  createSpojexServerClient,
  type SpojexClient,
} from "@/lib/api/client";
import {
  SESSION_COOKIE,
  parseSessionJson,
  type SpojexSession,
} from "@/lib/api/session";

function userBearer(value: string | null) {
  if (!value) return "";
  const token = value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : value.trim();
  if (!token || token.startsWith("sb_")) return "";
  return token;
}

function sessionFromCookies(cookieStore: Awaited<ReturnType<typeof cookies>>): SpojexSession | null {
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return parseSessionJson(decodeURIComponent(raw));
  } catch {
    return parseSessionJson(raw);
  }
}

function sessionFromBearer(token: string): SpojexSession | null {
  if (!token) return null;
  return {
    access_token: token,
    refresh_token: "",
    token_type: "bearer",
    user: {
      id: "",
      aud: "authenticated",
      user_metadata: {},
      app_metadata: {},
    },
  };
}

export async function createServerSupabase(): Promise<SpojexClient> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const bearer = userBearer(headerStore.get("authorization"));

  let session = sessionFromCookies(cookieStore);
  if (bearer) {
    if (session?.access_token === bearer) {
      // keep full cookie session (has user + refresh)
    } else if (session?.access_token) {
      session = { ...session, access_token: bearer };
    } else {
      session = sessionFromBearer(bearer);
    }
  }

  return createSpojexServerClient(session);
}

export async function requestAccessToken() {
  const headerStore = await headers();
  const bearer = userBearer(headerStore.get("authorization"));
  if (bearer) return bearer;
  const cookieStore = await cookies();
  return sessionFromCookies(cookieStore)?.access_token ?? "";
}

export async function requestServerSession(): Promise<SpojexSession | null> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const bearer = userBearer(headerStore.get("authorization"));
  const fromCookie = sessionFromCookies(cookieStore);
  if (fromCookie) {
    if (bearer && fromCookie.access_token !== bearer) {
      return { ...fromCookie, access_token: bearer };
    }
    return fromCookie;
  }
  return bearer ? sessionFromBearer(bearer) : null;
}
