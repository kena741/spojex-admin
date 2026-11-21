import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { categoryFor } from "@/lib/catalog";
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
      "id, display_name, full_name, username, email, phone, role, avatar_url, verified, city, country, headline, bio, created_at, updated_at, deleted_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!user) return NextResponse.json({ error: "Person not found" }, { status: 404 });

  const [orgs, members, ver] = await Promise.all([
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
  ]);

  // Profile type badges from active assignments (M7 SoT); fall back to users.role.
  const profile_types: string[] = [];
  const { data: assigns } = await client
    .from("user_role_assignments")
    .select("account_role, category_slug, is_primary")
    .eq("user_id", id)
    .eq("status", "active")
    .limit(10);
  for (const row of assigns ?? []) {
    const account = String((row as { account_role?: string }).account_role ?? "");
    const category = String((row as { category_slug?: string }).category_slug ?? "");
    let badge = "";
    if (account === "athlete") badge = "athlete";
    else if (account === "professional") {
      badge =
        category === "photographer" ||
        category === "sports_journalist" ||
        category === "media"
          ? "media"
          : "professional";
    }
    if (badge && !profile_types.includes(badge)) profile_types.push(badge);
  }
  if (!profile_types.length) {
    const cat = categoryFor(user.role);
    if (cat === "athlete" || cat === "professional" || cat === "media") {
      profile_types.push(cat);
    }
  }

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
