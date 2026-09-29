import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServerSupabase, requestAccessToken } from "@/lib/supabase/server";
import { adminUsesServiceRole, createAdminClient } from "@/lib/supabase/admin";
import {
  hasPermission,
  permissionsForRole,
  type AdminRow,
} from "@/lib/admin-permissions";

export type AdminContext = {
  user: User;
  staff: AdminRow;
  permissions: string[];
  client: SupabaseClient;
};

export type AdminAuthResult =
  | { ok: true; context: AdminContext; error: null }
  | { ok: false; error: NextResponse; context: null };

async function fetchStaffRow(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("admin")
    .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as AdminRow | null;
}

async function loadStaff(user: User, sessionClient: SupabaseClient) {
  let staff = await fetchStaffRow(sessionClient, user.id);

  if (!staff && adminUsesServiceRole()) {
    staff = await fetchStaffRow(createAdminClient(), user.id);
  }

  if (!staff || !staff.is_active) return null;

  let roleClient = sessionClient;
  if (adminUsesServiceRole()) {
    roleClient = createAdminClient();
  }

  const { data: roleRow } = await roleClient
    .from("admin_role")
    .select("permissions")
    .eq("slug", staff.role)
    .maybeSingle();

  const permissions = permissionsForRole(
    staff.role,
    (roleRow as { permissions?: string[] } | null)?.permissions,
  );

  const client = adminUsesServiceRole() ? createAdminClient() : sessionClient;

  return { staff, permissions, client };
}

async function resolveAuthUser(supabase: SupabaseClient): Promise<User | null> {
  const bearer = await requestAccessToken();
  if (bearer) {
    const { data } = await supabase.auth.getUser(bearer);
    if (data.user) return data.user;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) return userData.user;

  const { data: claimsData } = await supabase.auth.getClaims(bearer || undefined);
  const sub = claimsData?.claims?.sub;
  if (typeof sub !== "string" || !sub) return null;

  return {
    id: sub,
    aud: "authenticated",
    role: "authenticated",
    email: typeof claimsData.claims?.email === "string" ? claimsData.claims.email : undefined,
    app_metadata: {},
    user_metadata: {},
    created_at: "",
  } as User;
}

export async function requireAdminSession(): Promise<AdminAuthResult> {
  const supabase = await createServerSupabase();
  const user = await resolveAuthUser(supabase);

  if (!user) {
    return {
      ok: false,
      context: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const loaded = await loadStaff(user, supabase);
    if (!loaded) {
      return {
        ok: false,
        context: null,
        error: NextResponse.json(
          {
            error:
              "Admin access required. Your account must have an active row in the admin table (linked by user_id).",
          },
          { status: 403 },
        ),
      };
    }
    return {
      ok: true,
      error: null,
      context: { user, ...loaded },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve admin";
    return {
      ok: false,
      context: null,
      error: NextResponse.json({ error: message }, { status: 500 }),
    };
  }
}

export async function requireAdminPermission(permission: string): Promise<AdminAuthResult> {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth;
  if (!hasPermission(auth.context.permissions, permission)) {
    return {
      ok: false,
      context: null,
      error: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }),
    };
  }
  return auth;
}

export async function requireAnyAdminPermission(permissions: string[]): Promise<AdminAuthResult> {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth;
  if (!permissions.some((permission) => hasPermission(auth.context.permissions, permission))) {
    return {
      ok: false,
      context: null,
      error: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }),
    };
  }
  return auth;
}

export function missingServiceRoleMessage() {
  if (adminUsesServiceRole()) return null;
  return "Add SUPABASE_SERVICE_ROLE_KEY to .env.local to update rows owned by other users.";
}
