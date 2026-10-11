import { getSpojexApiBaseUrl } from "@/lib/env";
import {
  clearBrowserSession,
  getBrowserSession,
  saveBrowserSession,
  type SpojexSession,
  type SpojexUser,
} from "@/lib/api/session";

export class SpojexApiError extends Error {
  status: number;
  code?: string;
  details?: string;

  constructor(message: string, status = 500, code?: string, details?: string) {
    super(message);
    this.name = "SpojexApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type TokenProvider = () => string | null | Promise<string | null>;
type SessionProvider = () => SpojexSession | null | Promise<SpojexSession | null>;
type SessionSaver = (session: SpojexSession | null) => void | Promise<void>;

let refreshing: Promise<boolean> | null = null;

export type HttpClientOptions = {
  getAccessToken?: TokenProvider;
  getSession?: SessionProvider;
  saveSession?: SessionSaver;
};

const defaultGetToken: TokenProvider = () => getBrowserSession()?.access_token ?? null;
const defaultGetSession: SessionProvider = () => getBrowserSession();
const defaultSaveSession: SessionSaver = (session) => {
  if (session) saveBrowserSession(session, "TOKEN_REFRESHED");
  else clearBrowserSession();
};

function normalizeUser(raw: Record<string, unknown>, emailHint = ""): SpojexUser {
  const id = String(raw.id ?? raw.user_id ?? "").trim();
  const email = ((raw.email as string | undefined) ?? emailHint) || null;
  const display = (raw.display_name as string | undefined) ?? null;
  const full = (raw.full_name as string | undefined) ?? display;
  return {
    id,
    email,
    role: (raw.role as string | undefined) ?? null,
    display_name: display,
    full_name: full,
    username: (raw.username as string | undefined) ?? null,
    avatar_url: (raw.avatar_url as string | undefined) ?? null,
    aud: "authenticated",
    user_metadata: {
      full_name: full,
      display_name: display,
    },
    app_metadata: {},
  };
}

export function sessionFromAuthPayload(
  raw: unknown,
  opts?: { emailHint?: string; fallbackRefresh?: string; fallbackUserId?: string },
): SpojexSession {
  if (!raw || typeof raw !== "object") {
    throw new SpojexApiError("Invalid auth response", 500);
  }
  const map = raw as Record<string, unknown>;
  const nested =
    map.session && typeof map.session === "object"
      ? (map.session as Record<string, unknown>)
      : map;
  const access = String(
    nested.access_token ?? nested.accessToken ?? map.token ?? "",
  ).trim();
  if (!access) throw new SpojexApiError("Missing access token", 500);
  const refresh = String(
    nested.refresh_token ?? nested.refreshToken ?? opts?.fallbackRefresh ?? "",
  ).trim();
  const userRaw =
    (nested.user && typeof nested.user === "object"
      ? (nested.user as Record<string, unknown>)
      : map.user && typeof map.user === "object"
        ? (map.user as Record<string, unknown>)
        : map.me && typeof map.me === "object"
          ? (map.me as Record<string, unknown>)
          : {}) || {};
  let user = normalizeUser(userRaw, opts?.emailHint ?? "");
  if (!user.id && opts?.fallbackUserId) {
    user = { ...user, id: opts.fallbackUserId };
  }
  if (!user.id) throw new SpojexApiError("Missing user id in auth response", 500);
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "bearer",
    user,
  };
}

export function createHttpClient(options: HttpClientOptions = {}) {
  const getAccessToken = options.getAccessToken ?? defaultGetToken;
  const getSession = options.getSession ?? defaultGetSession;
  const saveSession = options.saveSession ?? defaultSaveSession;
  const baseUrl = () => getSpojexApiBaseUrl();

  async function refreshSession(): Promise<boolean> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const existing = await getSession();
        const refresh = existing?.refresh_token?.trim() ?? "";
        if (!refresh) return false;
        const raw = await request("/api/v1/auth/refresh", {
          method: "POST",
          auth: false,
          body: { refresh_token: refresh },
          didRefresh: true,
        });
        const session = sessionFromAuthPayload(raw, {
          emailHint: existing?.user?.email ?? "",
          fallbackRefresh: refresh,
          fallbackUserId: existing?.user?.id ?? "",
        });
        await saveSession(session);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function request(
    path: string,
    init: {
      method?: string;
      body?: unknown;
      query?: Record<string, string | number | undefined | null>;
      auth?: boolean;
      didRefresh?: boolean;
    } = {},
  ): Promise<unknown> {
    const auth = init.auth !== false;
    const url = new URL(path.startsWith("http") ? path : `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined || v === null || v === "") continue;
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";

    if (auth) {
      const token = await getAccessToken();
      if (!token) {
        throw new SpojexApiError("Not authenticated", 401, "unauthorized");
      }
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: init.method || "GET",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch (err) {
      throw new SpojexApiError(err instanceof Error ? err.message : "Network error", 0);
    }

    if (response.status === 401 && auth && !init.didRefresh) {
      const existing = await getSession();
      if (existing?.refresh_token) {
        const ok = await refreshSession();
        if (ok) {
          return request(path, { ...init, didRefresh: true });
        }
      }
      await saveSession(null);
    }

    const text = await response.text();
    let decoded: unknown = null;
    if (text) {
      try {
        decoded = JSON.parse(text);
      } catch {
        decoded = text;
      }
    }

    if (response.ok) return decoded;

    const detail = errorMessage(decoded, text, response.status);
    throw new SpojexApiError(detail, response.status, response.status === 401 || response.status === 403 ? "unauthorized" : undefined, text);
  }

  return {
    request,
    refreshSession,
    get: (path: string, query?: Record<string, string | number | undefined | null>, auth = true) =>
      request(path, { method: "GET", query, auth }),
    post: (path: string, body?: unknown, auth = true) =>
      request(path, { method: "POST", body, auth }),
    patch: (path: string, body?: unknown, auth = true) =>
      request(path, { method: "PATCH", body, auth }),
    delete: (path: string, auth = true) => request(path, { method: "DELETE", auth }),
  };
}

function errorMessage(decoded: unknown, text: string, status: number) {
  if (decoded && typeof decoded === "object") {
    const map = decoded as Record<string, unknown>;
    const detail = map.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0];
      if (first && typeof first === "object" && "msg" in first) {
        return String((first as { msg: unknown }).msg);
      }
    }
    const message = map.message ?? map.error;
    if (message != null && String(message).trim()) return String(message).trim();
  }
  if (text.trim()) return text.trim();
  return `Request failed (${status})`;
}

export type SpojexHttp = ReturnType<typeof createHttpClient>;
