import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";

function userBearer(value: string | null) {
  if (!value) return "";
  const token = value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : value.trim();
  if (!token || token.startsWith("sb_")) return "";
  return token;
}

export async function createServerSupabase() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const bearer = userBearer(headerStore.get("authorization"));

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies; proxy handles refresh.
        }
      },
    },
    global: bearer
      ? {
          headers: {
            Authorization: `Bearer ${bearer}`,
          },
        }
      : {},
  });
}

export async function requestAccessToken() {
  const headerStore = await headers();
  return userBearer(headerStore.get("authorization"));
}
