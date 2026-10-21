"use client";

import { useCallback, useEffect, useState } from "react";
import { getSpojexClient } from "@/lib/spojex/client";
import {
  canAccessAdminRoute,
  hasPermission,
  permissionsForRole,
  type AdminRow,
} from "@/lib/admin-permissions";

export async function resolveAdminStaff(userId: string) {
  const client = getSpojexClient();
  // Prefer users.id match; also try via /admin/me when available
  const { data, error } = await client
    .from("admin")
    .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AdminRow | null;
}

/** Only when the admin table is empty — never advertise as normal onboarding. */
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

export function useAdminPermissions() {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<AdminRow | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const { data } = await getSpojexClient().auth.getUser();
        const user = data.user;
        if (!user) {
          if (!mounted) return;
          setStaff(null);
          setPermissions([]);
          setLoading(false);
          return;
        }

        // Prefer enriched /admin/me when the API is reachable
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
                if (!mounted) return;
                setBootstrapAvailable(Boolean(me.bootstrap_available));
                if (me.is_admin && me.staff) {
                  setStaff(me.staff);
                  setPermissions(
                    Array.isArray(me.permissions) && me.permissions.length
                      ? me.permissions
                      : permissionsForRole(me.staff.role),
                  );
                  setLoading(false);
                  return;
                }
              }
            }
          }
        } catch {
          // fall through to table lookup
        }

        let row: AdminRow | null = null;
        try {
          row = await resolveAdminStaff(user.id);
        } catch {
          row = null;
        }

        // Bootstrap only when the table is empty (checked via count)
        if (!row && !bootstrapTried.has(user.id)) {
          bootstrapTried.add(user.id);
          const { count } = await getSpojexClient()
            .from("admin")
            .select("id", { count: "exact", head: true });
          if ((count ?? 0) === 0) {
            setBootstrapAvailable(true);
            try {
              await bootstrapFirstAdmin(user);
              row = await resolveAdminStaff(user.id);
            } catch {
              row = null;
            }
          }
        }

        if (!row || !row.is_active) {
          if (!mounted) return;
          setStaff(null);
          setPermissions([]);
          setLoading(false);
          return;
        }

        const { data: roleRow } = await getSpojexClient()
          .from("admin_role")
          .select("permissions")
          .eq("slug", row.role)
          .maybeSingle();

        if (!mounted) return;
        setStaff(row);
        setPermissions(
          permissionsForRole(row.role, (roleRow as { permissions?: string[] } | null)?.permissions),
        );
        setLoading(false);
      } catch {
        if (!mounted) return;
        setStaff(null);
        setPermissions([]);
        setLoading(false);
      }
    };

    void load();
    const { data: sub } = getSpojexClient().auth.onAuthStateChange(() => {
      void load();
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

  return {
    loading,
    staff,
    permissions,
    bootstrapAvailable,
    can,
    canAccess: (pathname: string) => canAccessAdminRoute(pathname, can),
  };
}
