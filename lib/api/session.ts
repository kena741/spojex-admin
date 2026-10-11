export type SpojexUser = {
  id: string;
  email?: string | null;
  role?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
  aud?: string;
  created_at?: string;
};

export type SpojexSession = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  user: SpojexUser;
};

export const SESSION_COOKIE = "spojex_admin_session";
const STORAGE_KEY = "spojex_admin_session_v1";

type AuthListener = (event: string, session: SpojexSession | null) => void;

const listeners = new Set<AuthListener>();

function canUseDom() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string | null) {
  if (typeof document === "undefined") return;
  if (!value) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  // 30 days
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

export function parseSessionJson(raw: string | null | undefined): SpojexSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SpojexSession;
    if (!parsed?.access_token || !parsed?.user?.id) return null;
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token || "",
      token_type: parsed.token_type || "bearer",
      user: {
        ...parsed.user,
        aud: parsed.user.aud || "authenticated",
        user_metadata: parsed.user.user_metadata || {
          full_name: parsed.user.full_name,
          display_name: parsed.user.display_name,
        },
        app_metadata: parsed.user.app_metadata || {},
      },
    };
  } catch {
    return null;
  }
}

export function getBrowserSession(): SpojexSession | null {
  if (!canUseDom()) return null;
  const fromStorage = parseSessionJson(localStorage.getItem(STORAGE_KEY));
  if (fromStorage) return fromStorage;
  return parseSessionJson(readCookie(SESSION_COOKIE));
}

export function saveBrowserSession(session: SpojexSession, event = "SIGNED_IN") {
  const payload = JSON.stringify(session);
  if (canUseDom()) {
    localStorage.setItem(STORAGE_KEY, payload);
    writeCookie(SESSION_COOKIE, payload);
  }
  for (const listener of listeners) listener(event, session);
}

export function clearBrowserSession(event = "SIGNED_OUT") {
  if (canUseDom()) {
    localStorage.removeItem(STORAGE_KEY);
    writeCookie(SESSION_COOKIE, null);
  }
  for (const listener of listeners) listener(event, null);
}

export function onAuthStateChange(listener: AuthListener) {
  listeners.add(listener);
  return {
    data: {
      subscription: {
        unsubscribe() {
          listeners.delete(listener);
        },
      },
    },
  };
}

export function encodeSessionCookie(session: SpojexSession) {
  return encodeURIComponent(JSON.stringify(session));
}

export function sessionFromCookieHeader(cookieHeader: string | null | undefined): SpojexSession | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`));
  if (!match) return null;
  try {
    return parseSessionJson(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}
