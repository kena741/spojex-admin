/**
 * Ensure a gym has an organization row + owner membership for chat.
 * Used when `ensure_gym_organization` RPC is missing on Spojex Postgres.
 */
export async function ensureGymOrganizationViaTables(
  client: {
    from: (table: string) => any;
  },
  gymId: string,
): Promise<{ organizationId: string | null; error?: string }> {
  const { data: gym, error: gymError } = await client
    .from("gyms")
    .select(
      "id, name, description, country, city, category, logo_url, website, owner_user_id, organization_id, verification_status",
    )
    .eq("id", gymId)
    .maybeSingle();
  if (gymError) return { organizationId: null, error: gymError.message };
  if (!gym) return { organizationId: null, error: "Gym not found" };

  const existing = (gym.organization_id as string | null) ?? null;
  if (existing) return { organizationId: existing };

  const ownerId = (gym.owner_user_id as string | null) ?? null;
  if (!ownerId) {
    return {
      organizationId: null,
      error: "Assign a gym owner before enabling chat.",
    };
  }

  const rawCountry = String(gym.country ?? "").trim();
  const country =
    !rawCountry || ["ET", "ETH"].includes(rawCountry.toUpperCase())
      ? "Ethiopia"
      : rawCountry;
  const orgType = String(gym.category ?? "").trim() || "gym";
  const publicId = `gym-${gymId.replace(/-/g, "").slice(0, 12)}`;

  const { data: org, error: orgError } = await client
    .from("organizations")
    .insert({
      user_id: ownerId,
      name: gym.name || "Gym",
      organization_type: orgType,
      description: gym.description || "",
      country,
      city: gym.city || "",
      currency: "ETB",
      logo_url: String(gym.logo_url ?? "").trim() || null,
      website: String(gym.website ?? "").trim() || null,
      verified: String(gym.verification_status ?? "") === "verified",
      public_id: publicId,
      images: [],
      is_platform: false,
    })
    .select("id")
    .single();
  if (orgError || !org?.id) {
    return {
      organizationId: null,
      error: orgError?.message || "Could not create organization",
    };
  }

  await client.from("organization_members").upsert(
    {
      organization_id: org.id,
      user_id: ownerId,
      member_role: "owner",
      status: "active",
    },
    { onConflict: "organization_id,user_id" },
  );

  const { error: linkError } = await client
    .from("gyms")
    .update({ organization_id: org.id })
    .eq("id", gymId);
  if (linkError) {
    return { organizationId: org.id, error: linkError.message };
  }

  return { organizationId: org.id };
}
