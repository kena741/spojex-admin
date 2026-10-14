import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { ensureGymOrganizationViaTables } from "@/lib/ensure-gym-organization";
import { isRpcUnavailable } from "@/lib/rpc-unavailable";
import {
  gymCategories,
  gymStatuses,
  gymVerificationStatuses,
  slugifyGym,
  type GymStatus,
  type GymVerificationStatus,
} from "@/lib/gyms";

const allowedStatuses = new Set(gymStatuses.map((item) => item.id));
const allowedVerification = new Set(gymVerificationStatuses.map((item) => item.id));

async function resolveCategorySlug(
  client: { from: (table: string) => any },
  raw: string,
) {
  const category = raw.trim() || "gym";
  const { data, error } = await client
    .from("gym_categories")
    .select("slug")
    .eq("slug", category)
    .maybeSingle();
  if (!error && data?.slug) return data.slug as string;
  // Fallback until migration is applied.
  if (gymCategories.some((item) => item.id === category)) return category;
  return null;
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    name?: string;
    category?: string;
    city?: string;
    country?: string;
    location?: string;
    address?: string;
    description?: string;
    contact_phone?: string;
    contact_email?: string;
    website?: string;
    logo_url?: string;
    cover_url?: string;
    monthly_payment?: number;
    status?: string;
    verification_status?: string;
    owner_user_id?: string;
    owner_email?: string;
    owner_name?: string;
    activate?: boolean;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const category = await resolveCategorySlug(
    auth.context.client,
    body.category?.trim() || "gym",
  );
  if (!category) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  let ownerUserId = body.owner_user_id?.trim() || "";
  const ownerEmail = body.owner_email?.trim().toLowerCase() || "";
  let ownerName = body.owner_name?.trim() || "";

  if (!ownerUserId && ownerEmail) {
    const { data: owner, error: ownerError } = await auth.context.client
      .from("users")
      .select("id, display_name, email")
      .ilike("email", ownerEmail)
      .maybeSingle();
    if (ownerError) {
      return NextResponse.json({ error: ownerError.message }, { status: 400 });
    }
    if (!owner?.id) {
      return NextResponse.json(
        { error: "No SpoJex user found with that email. Create or invite the owner first." },
        { status: 400 },
      );
    }
    ownerUserId = owner.id;
    if (!ownerName) ownerName = owner.display_name?.trim() || owner.email || "";
  }

  if (ownerUserId) {
    const { data: ownerRow, error: ownerCheckError } = await auth.context.client
      .from("users")
      .select("id, display_name, email")
      .eq("id", ownerUserId)
      .maybeSingle();
    if (ownerCheckError) {
      return NextResponse.json({ error: ownerCheckError.message }, { status: 400 });
    }
    if (!ownerRow?.id) {
      return NextResponse.json({ error: "Owner user not found" }, { status: 400 });
    }
    if (!ownerName) {
      ownerName = ownerRow.display_name?.trim() || ownerRow.email || "";
    }
  }

  const activate = Boolean(body.activate);
  const status = (
    allowedStatuses.has((body.status ?? "") as GymStatus)
      ? body.status
      : activate
        ? "active"
        : "pending"
  ) as GymStatus;
  const verificationStatus = (
    allowedVerification.has((body.verification_status ?? "") as GymVerificationStatus)
      ? body.verification_status
      : activate
        ? "verified"
        : "pending"
  ) as GymVerificationStatus;

  const monthlyRaw = Number(body.monthly_payment);
  const monthlyPayment =
    Number.isFinite(monthlyRaw) && monthlyRaw >= 0 ? monthlyRaw : 0;

  const slugBase = slugifyGym(name) || "gym";
  const slug = `${slugBase}-${Date.now().toString(36).slice(-4)}`;

  // Spojex gyms rows have many NOT NULL columns without Postgres DEFAULTs when
  // the schema came from SQLAlchemy create_all — always send safe empties.
  const { data, error } = await auth.context.client
    .from("gyms")
    .insert({
      name,
      slug,
      category,
      city: body.city?.trim() || "",
      country: body.country?.trim() || "ET",
      location: body.location?.trim() || "",
      address: body.address?.trim() || "",
      description: body.description?.trim() || "",
      contact_phone: body.contact_phone?.trim() || "",
      contact_email: body.contact_email?.trim() || "",
      website: body.website?.trim() || "",
      logo_url: body.logo_url?.trim() || "",
      cover_url: body.cover_url?.trim() || "",
      photos: [],
      facilities: [],
      opening_hours: {},
      bank_info: {},
      business_license_url: "",
      rating_avg: 0,
      rating_count: 0,
      follower_count: 0,
      commission_pct: 10,
      search_text: "",
      join_code: "",
      is_featured: false,
      feature_status: "none",
      monthly_payment: monthlyPayment,
      status,
      verification_status: verificationStatus,
      owner_user_id: ownerUserId || null,
      owner_name: ownerName,
    })
    .select("*")
    .single();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }

  if (ownerUserId && data?.id) {
    await auth.context.client.from("gym_staff").upsert(
      {
        gym_id: data.id,
        user_id: ownerUserId,
        staff_role: "owner",
        is_active: true,
      },
      { onConflict: "gym_id,user_id" },
    );
    // Ensure org chat link (RPC when installed; otherwise table fallback).
    const ens = await auth.context.client.rpc("ensure_gym_organization", {
      p_gym_id: data.id,
    });
    if (ens.error && isRpcUnavailable(ens.error)) {
      await ensureGymOrganizationViaTables(auth.context.client, data.id);
    }
    const refreshed = await auth.context.client
      .from("gyms")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (refreshed.data) {
      return NextResponse.json({ data: refreshed.data });
    }
  }

  return NextResponse.json({ data });
}
