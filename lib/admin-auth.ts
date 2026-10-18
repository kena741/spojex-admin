import { NextResponse } from "next/server";
import type { SpojexClient, SpojexUser } from "@/lib/api/client";
import { createServerSpojex, requestAccessToken } from "@/lib/spojex/server";
import { canUseAdminClient, createAdminClientFromRequest } from "@/lib/spojex/admin";
import {
  hasPermission,
  permissionsForRole,
  type AdminRow,
} from "@/lib/admin-permissions";

export type AdminContext = {
  user: SpojexUser;
  staff: AdminRow;
  permissions: string[];
  client: SpojexClient;
};

export type AdminAuthResult =
  | { ok: true; context: AdminContext; error: null }
  | { ok: false; error: NextResponse; context: null };

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (err && typeof err === "object") {
    const map = err as { message?: unknown; error?: unknown; detail?: unknown };
    for (const value of [map.message, map.error, map.detail]) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  if (typeof err === "string" && err.trim()) return err.trim();
  return fallback;
}

async function fetchStaffRow(client: SpojexClient, userId: string) {
  const { data, error } = await client
    .from("admin")
    .select("id, user_id, full_name, email, role, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(errorMessage(error, "Could not load admin staff row"));
  }
  return data as AdminRow | null;
}

async function loadStaff(user: SpojexUser, sessionClient: SpojexClient) {
  let staff: AdminRow | null = null;
  let staffError: unknown = null;
  try {
    staff = await fetchStaffRow(sessionClient, user.id);
  } catch (err) {
    staffError = err;
  }

  if (!staff && canUseAdminClient()) {
    const adminClient = await createAdminClientFromRequest();
    staff = await fetchStaffRow(adminClient, user.id);
  } else if (!staff && staffError) {
    throw staffError instanceof Error
      ? staffError
      : new Error(errorMessage(staffError, "Failed to resolve admin"));
  }

  if (!staff || !staff.is_active) return null;

  let roleClient = sessionClient;
  if (canUseAdminClient()) {
    roleClient = await createAdminClientFromRequest();
  }

  // Role permissions are optional — don't fail the whole admin session if this
  // call races an expired token (defaults still grant role-based access).
  const { data: roleRow, error: roleError } = await roleClient
    .from("admin_role")
    .select("permissions")
    .eq("slug", staff.role)
    .maybeSingle();
  if (roleError) {
    console.warn("admin_role lookup failed", roleError);
  }

  const permissions = permissionsForRole(
    staff.role,
    (roleRow as { permissions?: string[] } | null)?.permissions,
  );

  const client = canUseAdminClient()
    ? await createAdminClientFromRequest()
    : sessionClient;

  return { staff, permissions, client };
}

async function resolveAuthUser(client: SpojexClient): Promise<SpojexUser | null> {
  const bearer = await requestAccessToken();
  if (bearer) {
    const { data } = await client.auth.getUser(bearer);
    if (data.user?.id) return data.user;
  }

  const { data: userData } = await client.auth.getUser();
  if (userData.user?.id) return userData.user;

  const { data: claimsData } = await client.auth.getClaims(bearer || undefined);
  const sub = claimsData?.claims?.sub;
  if (typeof sub !== "string" || !sub) return null;

  return {
    id: sub,
    aud: "authenticated",
    email: typeof claimsData.claims?.email === "string" ? String(claimsData.claims.email) : undefined,
    role: typeof claimsData.claims?.role === "string" ? String(claimsData.claims.role) : undefined,
    user_metadata: {},
    app_metadata: {},
  };
}

export async function requireAdminSession(): Promise<AdminAuthResult> {
  const spojex = await createServerSpojex();
  const user = await resolveAuthUser(spojex);

  if (!user) {
    return {
      ok: false,
      context: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const loaded = await loadStaff(user, spojex);
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
    const message = errorMessage(err, "Failed to resolve admin");
    const lower = message.toLowerCase();
    const unauthorized =
      lower.includes("sign in") ||
      lower.includes("unauthorized") ||
      lower.includes("not authenticated") ||
      lower.includes("invalid token") ||
      lower.includes("jwt");
    return {
      ok: false,
      context: null,
      error: NextResponse.json(
        {
          error: unauthorized
            ? "Your admin session expired. Sign in again, then retry saving the stadium."
            : message,
        },
        { status: unauthorized ? 401 : 500 },
      ),
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
  return null;
}
