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
  const { data, error } = await getSpojexClient()
    .from("admin")
    .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AdminRow | null;
}

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

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const { data } = await getSpojexClient().auth.getUser();
        const user = data.user;
        if (!user) {
          if (!mounted) return;
          setStaff((current) => (current === null ? current : null));
          setPermissions((current) => (current.length === 0 ? current : []));
          setLoading(false);
          return;
        }

        let row: AdminRow | null = null;
        try {
          row = await resolveAdminStaff(user.id);
        } catch {
          row = null;
        }
        if (!row && !bootstrapTried.has(user.id)) {
          bootstrapTried.add(user.id);
          try {
            await bootstrapFirstAdmin(user);
            row = await resolveAdminStaff(user.id);
          } catch {
            row = null;
          }
        }
        if (!row || !row.is_active) {
          if (!mounted) return;
          setStaff((current) => (current === null ? current : null));
          setPermissions((current) => (current.length === 0 ? current : []));
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
        setStaff((current) => (current === null ? current : null));
        setPermissions((current) => (current.length === 0 ? current : []));
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
    can,
    canAccess: (pathname: string) => canAccessAdminRoute(pathname, can),
  };
}
