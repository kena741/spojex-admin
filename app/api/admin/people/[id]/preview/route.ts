import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/spojex/admin";

type Ctx = { params: Promise<{ id: string }> };

/** Lightweight drawer payload — separate from full profile page loads. */
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

  const [athlete, professional, media, orgs, members, ver] = await Promise.all([
    client.from("athlete_profiles").select("id, position, team").eq("user_id", id).maybeSingle(),
    client
      .from("professional_profiles")
      .select("id, organization, specializations")
      .eq("user_id", id)
      .maybeSingle(),
    client.from("media_profiles").select("id, outlet, media_type").eq("user_id", id).maybeSingle(),
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

  const profile_types: string[] = [];
  if (athlete.data) profile_types.push("athlete");
  if (professional.data) profile_types.push("professional");
  if (media.data) profile_types.push("media");

  return NextResponse.json({
    data: {
      user,
      profile_types,
      profiles: {
        athlete: athlete.data,
        professional: professional.data,
        media: media.data,
      },
      owned_organizations: orgs.data ?? [],
      memberships: members.data ?? [],
      verifications: ver.data ?? [],
      account_status: user.deleted_at ? "restricted" : "active",
    },
  });
}
