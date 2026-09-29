import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { adminUsesServiceRole, createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id: gymId } = await params;
  const client = adminUsesServiceRole() ? createAdminClient() : auth.context.client;

  const { data: gym, error: gymError } = await client
    .from("gyms")
    .select("id, owner_user_id, organization_id")
    .eq("id", gymId)
    .maybeSingle();
  if (gymError) {
    return NextResponse.json({ error: gymError.message }, { status: 400 });
  }
  if (!gym) {
    return NextResponse.json({ error: "Gym not found" }, { status: 404 });
  }
  if (!gym.owner_user_id) {
    return NextResponse.json(
      { error: "Assign a gym owner before enabling chat." },
      { status: 400 },
    );
  }

  const { data: orgId, error } = await client.rpc("ensure_gym_organization", {
    p_gym_id: gymId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: refreshed } = await client
    .from("gyms")
    .select("id, organization_id")
    .eq("id", gymId)
    .maybeSingle();

  return NextResponse.json({
    data: {
      organization_id: refreshed?.organization_id ?? orgId,
    },
  });
}
