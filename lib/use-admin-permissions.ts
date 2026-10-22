"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ensureAdminCacheAuthBinding,
  setAdminCacheUserId,
  clearAdminSessionCache,
  clearUiState,
} from "@/lib/admin-session-cache";
import { clearIdentityCatalogCache } from "@/lib/identity-catalog";
import { getSpojexClient } from "@/lib/spojex/client";
import {
  canAccessAdminRoute,
  hasPermission,
  permissionsForRole,
  type AdminRow,
} from "@/lib/admin-permissions";

export async function resolveAdminStaff(userId: string) {
  const client = getSpojexClient();
  const { data, error } = await client
    .from("admin")
    .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AdminRow | null;
}

/** Only when the admin table is empty - never advertise as normal onboarding. */
export async function bootstrapFirstAdmin(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const display =
    `${user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? ""}`.trim() ||
    user.email?.split("@")[0] ||
    "SpoJex admin";

  const { error } = await getSpojexClient().from("admin").insert({
    user_id: user.id,
    full_name: display,
    email: user.email ?? null,
    role: "super_admin",
    is_active: true,
  });

  if (error && !error.message.toLowerCase().includes("duplicate")) {
    throw new Error(error.message);
  }
}

const bootstrapTried = new Set<string>();

/** Shared cache so AuthGuard + page hooks don't flash empty permissions. */
type PermissionsCache = {
  staff: AdminRow | null;
  permissions: string[];
  bootstrapAvailable: boolean;
  userId: string | null;
  fetchedAt: number;
};
let permissionsCache: PermissionsCache | null = null;
let permissionsInflight: Promise<PermissionsCache> | null = null;

const PERMS_STALE_MS = 5 * 60 * 1000;

function samePerms(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function applyCache(
  next: PermissionsCache,
  setters: {
    setStaff: (v: AdminRow | null) => void;
    setPermissions: (v: string[]) => void;
    setBootstrapAvailable: (v: boolean) => void;
    setLoading: (v: boolean) => void;
  },
  prevPermissions: string[],
) {
  permissionsCache = next;
  setAdminCacheUserId(next.userId);
  setters.setStaff(next.staff);
  if (!samePerms(prevPermissions, next.permissions)) {
    setters.setPermissions(next.permissions);
  }
  setters.setBootstrapAvailable(next.bootstrapAvailable);
  setters.setLoading(false);
}

async function loadPermissionsOnce(force = false): Promise<PermissionsCache> {
  if (
    !force &&
    permissionsCache &&
    Date.now() - permissionsCache.fetchedAt < PERMS_STALE_MS
  ) {
    return permissionsCache;
  }
  if (!force && permissionsInflight) return permissionsInflight;

  permissionsInflight = (async () => {
    try {
      const { data } = await getSpojexClient().auth.getUser();
      const user = data.user;
      if (!user) {
        const empty: PermissionsCache = {
          staff: null,
          permissions: [],
          bootstrapAvailable: false,
          userId: null,
          fetchedAt: Date.now(),
        };
        permissionsCache = empty;
        setAdminCacheUserId(null);
        clearAdminSessionCache();
        clearUiState();
        return empty;
      }

      try {
        const session = await getSpojexClient().auth.getSession();
        const access = session.data.session?.access_token;
        if (access) {
          const base =
            process.env.NEXT_PUBLIC_SPOJEX_API_BASE_URL ||
            process.env.SPOJEX_API_BASE_URL ||
            "";
          if (base) {
            const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/admin/me`, {
              headers: { Authorization: `Bearer ${access}` },
              cache: "no-store",
            });
            if (res.ok) {
              const me = (await res.json()) as {
                is_admin?: boolean;
                bootstrap_available?: boolean;
                permissions?: string[];
                staff?: AdminRow | null;
              };
              if (me.is_admin && me.staff) {
                const perms =
                  Array.isArray(me.permissions) && me.permissions.length
                    ? me.permissions
                    : permissionsForRole(me.staff.role);
                const next: PermissionsCache = {
                  staff: me.staff,
                  permissions: perms,
                  bootstrapAvailable: Boolean(me.bootstrap_available),
                  userId: user.id,
                  fetchedAt: Date.now(),
                };
                permissionsCache = next;
                setAdminCacheUserId(user.id);
                return next;
              }
            }
          }
        }
      } catch {
        // fall through
      }

      let row: AdminRow | null = null;
      try {
        row = await resolveAdminStaff(user.id);
      } catch {
        row = null;
      }

      if (!row && !bootstrapTried.has(user.id)) {
        bootstrapTried.add(user.id);
        const { count } = await getSpojexClient()
          .from("admin")
          .select("id", { count: "exact", head: true });
        if ((count ?? 0) === 0) {
          try {
            await bootstrapFirstAdmin(user);
            row = await resolveAdminStaff(user.id);
            const next: PermissionsCache = {
              staff: row,
              permissions: row ? permissionsForRole(row.role) : [],
              bootstrapAvailable: true,
              userId: user.id,
              fetchedAt: Date.now(),
            };
            permissionsCache = next;
            setAdminCacheUserId(user.id);
            return next;
          } catch {
            row = null;
          }
        }
      }

      if (!row || !row.is_active) {
        const next: PermissionsCache = {
          staff: null,
          permissions: [],
          bootstrapAvailable: false,
          userId: user.id,
          fetchedAt: Date.now(),
        };
        permissionsCache = next;
        setAdminCacheUserId(user.id);
        return next;
      }

      const { data: roleRow } = await getSpojexClient()
        .from("admin_role")
        .select("permissions")
        .eq("slug", row.role)
        .maybeSingle();

      const next: PermissionsCache = {
        staff: row,
        permissions: permissionsForRole(
          row.role,
          (roleRow as { permissions?: string[] } | null)?.permissions,
        ),
        bootstrapAvailable: false,
        userId: user.id,
        fetchedAt: Date.now(),
      };
      permissionsCache = next;
      setAdminCacheUserId(user.id);
      return next;
    } catch {
      const empty: PermissionsCache = {
        staff: null,
        permissions: [],
        bootstrapAvailable: false,
        userId: null,
        fetchedAt: Date.now(),
      };
      permissionsCache = empty;
      return empty;
    } finally {
      permissionsInflight = null;
    }
  })();

  return permissionsInflight;
}

export function useAdminPermissions() {
  ensureAdminCacheAuthBinding();

  const [loading, setLoading] = useState(() => !permissionsCache);
  const [staff, setStaff] = useState<AdminRow | null>(() => permissionsCache?.staff ?? null);
  const [permissions, setPermissions] = useState<string[]>(
    () => permissionsCache?.permissions ?? [],
  );
  const [bootstrapAvailable, setBootstrapAvailable] = useState(
    () => permissionsCache?.bootstrapAvailable ?? false,
  );

  useEffect(() => {
    let mounted = true;
    let prevPerms = permissionsCache?.permissions ?? [];
    const setters = {
      setStaff,
      setPermissions: (v: string[]) => {
        prevPerms = v;
        setPermissions(v);
      },
      setBootstrapAvailable,
      setLoading,
    };

    const apply = (next: PermissionsCache) => {
      if (!mounted) return;
      applyCache(next, setters, prevPerms);
      prevPerms = next.permissions;
    };

    // Instant paint from module cache; only network if missing/stale
    if (permissionsCache) {
      apply(permissionsCache);
      if (Date.now() - permissionsCache.fetchedAt >= PERMS_STALE_MS) {
        void loadPermissionsOnce(false).then(apply);
      }
    } else {
      void loadPermissionsOnce(false).then(apply);
    }

    const { data: sub } = getSpojexClient().auth.onAuthStateChange((event) => {
      // Ignore token refresh noise — same user, keep cache.
      if (event === "TOKEN_REFRESHED") return;
      if (event === "SIGNED_OUT") {
        permissionsCache = null;
        clearAdminSessionCache();
        clearUiState();
        clearIdentityCatalogCache();
        setAdminCacheUserId(null);
        if (!mounted) return;
        setStaff(null);
        setPermissions([]);
        setBootstrapAvailable(false);
        setLoading(false);
        return;
      }
      void loadPermissionsOnce(true).then(apply);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const can = useCallback(
    (permission: string) => hasPermission(permissions, permission),
    [permissions],
  );

  const canAccess = useMemo(
    () => (pathname: string) => canAccessAdminRoute(pathname, can),
    [can],
  );

  return {
    loading,
    staff,
    permissions,
    bootstrapAvailable,
    can,
    canAccess,
  };
}
