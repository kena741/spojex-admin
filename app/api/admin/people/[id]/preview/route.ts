import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import {
  collectProfileBadges,
  profileTypeBadges,
  type AssignmentLike,
} from "@/lib/people/assignment-badges";
import { createAdminClient } from "@/lib/spojex/admin";

type Ctx = { params: Promise<{ id: string }> };

/** Lightweight drawer payload - separate from full profile page loads. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireAnyAdminPermission(["users:read", "profiles:read"]);
  if (!auth.ok) return auth.error;

  const { id } = await ctx.params;
  const client = createAdminClient();

  const { data: user, error } = await client
    .from("users")
    .select(
      "id, display_name, full_name, username, email, phone, role, avatar_url, verified, city, country, headline, bio, created_at, updated_at, deleted_at, active_roles",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!user) return NextResponse.json({ error: "Person not found" }, { status: 404 });

  const [orgs, members, ver, assignsRes] = await Promise.all([
    client.from("organizations").select("id, name, organization_type, verified").eq("user_id", id),
    client
      .from("organization_members")
      .select("organization_id, member_role, status, organizations(id, name)")
      .eq("user_id", id)
      .limit(20),
    client
      .from("identity_verification_requests")
      .select("id, status, created_at, reviewed_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    client
      .from("user_role_assignments")
      .select("account_role, category_slug, is_primary")
      .eq("user_id", id)
      .eq("status", "active")
      .limit(10),
  ]);

  // Profile type badges from active assignments (M7 SoT); fall back to active_roles / users.role.
  const profile_types = profileTypeBadges(
    collectProfileBadges({
      assignments: (assignsRes.data ?? []) as AssignmentLike[],
      activeRoles: Array.isArray((user as { active_roles?: unknown }).active_roles)
        ? ((user as { active_roles: AssignmentLike[] }).active_roles)
        : null,
      role: user.role,
    }),
  );

  return NextResponse.json({
    data: {
      user,
      profile_types,
      profiles: {
        athlete: null,
        professional: null,
        media: null,
      },
      owned_organizations: orgs.data ?? [],
      memberships: members.data ?? [],
      verifications: ver.data ?? [],
      account_status: user.deleted_at ? "restricted" : "active",
    },
  });
}
