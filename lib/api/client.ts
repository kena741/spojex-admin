import {
  createHttpClient,
  sessionFromAuthPayload,
  SpojexApiError,
  type SpojexHttp,
} from "@/lib/api/http";
import { SpojexQueryBuilder } from "@/lib/api/query";
import {
  clearBrowserSession,
  getBrowserSession,
  onAuthStateChange,
  saveBrowserSession,
  type SpojexSession,
  type SpojexUser,
} from "@/lib/api/session";
import { getSpojexApiBaseUrl } from "@/lib/env";

export type { SpojexSession, SpojexUser };

type SessionProvider = () => SpojexSession | null | Promise<SpojexSession | null>;
type SessionSaver = (session: SpojexSession | null, event?: string) => void | Promise<void>;

export type SpojexClientOptions = {
  getSession?: SessionProvider;
  saveSession?: SessionSaver;
};

function authError(message: string) {
  return { message, name: "AuthApiError", status: 400 };
}

function storageError(message: string) {
  return { message, name: "StorageApiError", status: 501 };
}

function decodeJwtClaims(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    const claims = JSON.parse(json) as Record<string, unknown>;
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

function userFromSession(session: SpojexSession | null): SpojexUser | null {
  return session?.user ?? null;
}

export function createSpojexClient(options: SpojexClientOptions = {}) {
  const getSession: SessionProvider = options.getSession ?? (() => getBrowserSession());
  const saveSession: SessionSaver =
    options.saveSession ??
    ((session, event) => {
      if (session) saveBrowserSession(session, event ?? "SIGNED_IN");
      else clearBrowserSession(event ?? "SIGNED_OUT");
    });

  const http = createHttpClient({
    getAccessToken: async () => (await getSession())?.access_token ?? null,
    getSession,
    saveSession: async (session) => {
      await saveSession(session, session ? "TOKEN_REFRESHED" : "SIGNED_OUT");
    },
  });

  const auth = {
    async signUp(creds: { email: string; password: string; full_name: string }) {
      try {
        const fullName = creds.full_name.trim();
        const raw = await http.post(
          "/api/v1/auth/signup",
          {
            email: creds.email.trim().toLowerCase(),
            password: creds.password,
            display_name: fullName,
            full_name: fullName,
            role: "fan",
          },
          false,
        );
        const session = sessionFromAuthPayload(raw, { emailHint: creds.email });
        await saveSession(session, "SIGNED_IN");
        return { data: { session, user: session.user }, error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sign up failed";
        return { data: { session: null, user: null }, error: authError(message) };
      }
    },

    async signInWithPassword( creds: { email: string; password: string }) {
      try {
        const raw = await http.post(
          "/api/v1/auth/login",
          { email: creds.email.trim().toLowerCase(), password: creds.password },
          false,
        );
        const session = sessionFromAuthPayload(raw, { emailHint: creds.email });
        await saveSession(session, "SIGNED_IN");
        return { data: { session, user: session.user }, error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Login failed";
        return { data: { session: null, user: null }, error: authError(message) };
      }
    },

    async signOut() {
      await saveSession(null, "SIGNED_OUT");
      return { error: null };
    },

    async getSession() {
      const session = await getSession();
      return { data: { session }, error: null };
    },

    async getUser(jwt?: string) {
      try {
        if (jwt) {
          const ephemeral = createHttpClient({
            getAccessToken: () => jwt,
            getSession: () => null,
            saveSession: () => undefined,
          });
          const raw = (await ephemeral.get("/api/v1/auth/me")) as Record<string, unknown>;
          const user = sessionFromAuthPayload(
            { access_token: jwt, refresh_token: "", user: raw },
            { fallbackUserId: String(raw.id ?? "") },
          ).user;
          return { data: { user }, error: null };
        }
        const session = await getSession();
        if (!session?.access_token) {
          return { data: { user: null }, error: null };
        }
        try {
          const raw = (await http.get("/api/v1/auth/me")) as Record<string, unknown>;
          const user = sessionFromAuthPayload(
            {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              user: raw,
            },
            { fallbackUserId: session.user.id, emailHint: session.user.email ?? "" },
          ).user;
          if (
            user.email !== session.user.email ||
            user.role !== session.user.role ||
            user.display_name !== session.user.display_name
          ) {
            await saveSession({ ...session, user }, "USER_UPDATED");
          }
          return { data: { user }, error: null };
        } catch {
          return { data: { user: userFromSession(session) }, error: null };
        }
      } catch (err) {
        return {
          data: { user: null },
          error: authError(err instanceof Error ? err.message : "Failed to load user"),
        };
      }
    },

    async getClaims(jwt?: string) {
      const session = await getSession();
      const token = jwt || session?.access_token || null;
      const claims = decodeJwtClaims(token);
      if (!claims) return { data: { claims: null }, error: null };
      if (!claims.sub && session?.user?.id) claims.sub = session.user.id;
      if (!claims.email && session?.user?.email) claims.email = session.user.email;
      return { data: { claims }, error: null };
    },

    async resetPasswordForEmail(_email: string, _opts?: { redirectTo?: string }) {
      return {
        data: null,
        error: authError(
          "Password reset email is not available on Spojex auth yet. Ask the user to recover via the app, or recreate the login.",
        ),
      };
    },

    onAuthStateChange(callback: (event: string, session: SpojexSession | null) => void) {
      return onAuthStateChange(callback);
    },

    admin: {
      async listUsers(opts?: { page?: number; perPage?: number }) {
        const page = Math.max(1, opts?.page ?? 1);
        const perPage = Math.min(200, Math.max(1, opts?.perPage ?? 50));
        try {
          const rows = (await http.get("/api/v1/data/users", {
            limit: perPage,
            offset: (page - 1) * perPage,
          })) as Record<string, unknown>[];
          const users = (Array.isArray(rows) ? rows : []).map((row) => ({
            id: String(row.id ?? row.user_id ?? ""),
            email: (row.email as string | undefined) ?? undefined,
            user_metadata: {
              full_name: row.full_name,
              display_name: row.display_name,
              role: row.role,
              phone: row.phone,
              city: row.city,
              country: row.country,
            },
            app_metadata: {},
            created_at: String(row.created_at ?? ""),
          }));
          return {
            data: { users, aud: "authenticated" },
            error: null,
          };
        } catch (err) {
          return {
            data: { users: [] },
            error: authError(err instanceof Error ? err.message : "Failed to list users"),
          };
        }
      },

      async createUser(input: {
        email: string;
        password: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      }) {
        try {
          const meta = input.user_metadata ?? {};
          const raw = await http.post(
            "/api/v1/auth/signup",
            {
              email: input.email.trim().toLowerCase(),
              password: input.password,
              display_name: (meta.display_name as string) || (meta.full_name as string) || undefined,
              full_name: (meta.full_name as string) || (meta.display_name as string) || undefined,
              role: (meta.role as string) || "fan",
              phone: (meta.phone as string) || undefined,
              city: (meta.city as string) || undefined,
              country: (meta.country as string) || undefined,
              currency: (meta.currency as string) || undefined,
            },
            false,
          );
          const session = sessionFromAuthPayload(raw, { emailHint: input.email });
          return {
            data: { user: session.user },
            error: null,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to create user";
          return { data: { user: null }, error: authError(message) };
        }
      },

      /** Create a login without returning a password (Spojex has no invite-email transport yet). */
      async inviteUserByEmail(
        email: string,
        opts?: { data?: Record<string, unknown>; redirectTo?: string },
      ) {
        const password = `Tmp-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}!aA1`;
        return this.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: opts?.data,
        });
      },

      async updateUserById(
        id: string,
        patch: {
          password?: string;
          email?: string;
          email_confirm?: boolean;
          user_metadata?: Record<string, unknown>;
        },
      ) {
        try {
          if (patch.password) {
            return {
              data: { user: null },
              error: authError(
                "Password updates via admin API are not available yet. Ask the user to reset via the app, or recreate the login.",
              ),
            };
          }
          const body: Record<string, unknown> = {};
          if (patch.email) body.email = patch.email.trim().toLowerCase();
          const meta = patch.user_metadata ?? {};
          for (const key of [
            "display_name",
            "full_name",
            "role",
            "phone",
            "city",
            "country",
            "currency",
            "avatar_url",
          ]) {
            if (meta[key] !== undefined) body[key] = meta[key];
          }
          if (!Object.keys(body).length) {
            return { data: { user: { id } }, error: null };
          }
          const updated = (await http.patch(`/api/v1/data/users/${id}`, body)) as Record<
            string,
            unknown
          >;
          return {
            data: {
              user: {
                id: String(updated.id ?? id),
                email: (updated.email as string | undefined) ?? patch.email,
                user_metadata: meta,
              },
            },
            error: null,
          };
        } catch (err) {
          return {
            data: { user: null },
            error: authError(err instanceof Error ? err.message : "Failed to update user"),
          };
        }
      },
    },
  };

  const storage = {
    from(bucket: string) {
      const unsupported = (action: string) => ({
        data: null,
        error: storageError(
          `${action} for "${bucket}" is not available. Upload via admin media routes (Spojex /api/v1/media) or lib/spojex-media.`,
        ),
      });
      return {
        async upload(_path: string, _file: unknown, _opts?: unknown) {
          return unsupported("Uploads");
        },
        async uploadToSignedUrl(_path: string, _token: string, _file: unknown, _opts?: unknown) {
          return unsupported("Signed uploads");
        },
        async createSignedUploadUrl(_path: string, _opts?: unknown) {
          return {
            data: null as { signedUrl?: string; token?: string; path?: string } | null,
            error: storageError(
              `Signed upload URLs for "${bucket}" are not available on the Spojex client. Use Spojex /api/v1/media/uploads/sign.`,
            ),
          };
        },
        async createSignedUrls(paths: string[], _expiresIn?: number) {
          return {
            data: paths.map((path) => ({
              path,
              signedUrl: null as string | null,
              error: "Storage signing is not available on the Spojex client.",
            })),
            error: storageError(
              `Signed URLs for "${bucket}" are not available on the Spojex client. Use Spojex /api/v1/media/objects/{id}/download-url.`,
            ),
          };
        },
        async createSignedUrl(path: string, _expiresIn?: number) {
          return {
            data: { signedUrl: null as string | null, path },
            error: storageError(
              `Signed URLs for "${bucket}" are not available on the Spojex client. Use Spojex /api/v1/media/objects/{id}/download-url.`,
            ),
          };
        },
        async remove(_paths: string[]) {
          return { data: null, error: null };
        },
        getPublicUrl(path: string) {
          const base = getSpojexApiBaseUrl();
          return {
            data: {
              publicUrl: `${base}/storage/v1/object/public/${bucket}/${path.replace(/^\//, "")}`,
            },
          };
        },
      };
    },
  };

  async function rpc(fn: string, args?: Record<string, unknown>) {
    try {
      const data = await http.post(`/api/v1/rpc/${fn}`, args ?? {});
      // Untyped RPC payloads (same as Spojex `.rpc()`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { data: data as any, error: null };
    } catch (err) {
      return {
        data: null,
        error: {
          message: err instanceof Error ? err.message : String(err),
          code: err instanceof SpojexApiError ? err.code : undefined,
          details: err instanceof SpojexApiError ? err.details : undefined,
        },
      };
    }
  }

  return {
    auth,
    storage,
    rpc,
    from(table: string) {
      return new SpojexQueryBuilder(http, table);
    },
    http,
  };
}

export type SpojexClient = ReturnType<typeof createSpojexClient>;


export type User = SpojexUser;

let browserSingleton: SpojexClient | null = null;

export function getSpojexBrowserClient(): SpojexClient {
  if (!browserSingleton) {
    browserSingleton = createSpojexClient();
  }
  return browserSingleton;
}

export function createSpojexServerClient(session: SpojexSession | null): SpojexClient {
  let current = session;
  return createSpojexClient({
    getSession: () => current,
    saveSession: (next) => {
      current = next;
    },
  });
}

export function createSpojexAdminClient(session: SpojexSession | null): SpojexClient {
  return createSpojexServerClient(session);
}

export type { SpojexHttp };
