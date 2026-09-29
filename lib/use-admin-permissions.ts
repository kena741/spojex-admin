"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import {
  canAccessAdminRoute,
  hasPermission,
  permissionsForRole,
  type AdminRow,
} from "@/lib/admin-permissions";

export async function resolveAdminStaff(userId: string) {
  const { data, error } = await getSupabase()
    .from("admin")
    .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
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

  const { error } = await getSupabase().from("admin").insert({
    user_id: user.id,
    full_name: display,
    email: user.email ?? null,
    role: "super_admin",
    is_active: true,
  });

  if (error && !error.message.toLowerCase().includes("duplicate")) {
    throw error;
  }
}

export function useAdminPermissions() {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<AdminRow | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const { data } = await getSupabase().auth.getUser();
        const user = data.user;
        if (!user) {
          if (mounted) {
            setStaff(null);
            setPermissions([]);
            setLoading(false);
          }
          return;
        }

        const row = await resolveAdminStaff(user.id);
        if (!row || !row.is_active) {
          if (mounted) {
            setStaff(null);
            setPermissions([]);
            setLoading(false);
          }
          return;
        }

        const { data: roleRow } = await getSupabase()
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
        if (mounted) {
          setStaff(null);
          setPermissions([]);
          setLoading(false);
        }
      }
    };

    void load();
    const { data: sub } = getSupabase().auth.onAuthStateChange(() => {
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
