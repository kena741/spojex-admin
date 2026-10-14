import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { organizationTypes } from "@/lib/catalog";

const allowedTypes = new Set(organizationTypes.map((item) => item.id));

export async function POST(request: Request) {
  const auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    name?: string;
    organization_type?: string;
    country?: string;
    city?: string;
    currency?: string;
    description?: string;
    website?: string | null;
    verified?: boolean;
    owner_user_id?: string;
    owner_email?: string;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const organizationType = (body.organization_type?.trim() || "club").toLowerCase();
  if (!allowedTypes.has(organizationType)) {
    return NextResponse.json({ error: "Invalid organization type" }, { status: 400 });
  }

  let ownerUserId = body.owner_user_id?.trim() || "";
  const ownerEmail = body.owner_email?.trim().toLowerCase() || "";

  if (!ownerUserId && ownerEmail) {
    const { data: owner, error: ownerError } = await auth.context.client
      .from("users")
      .select("id")
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
  }

  if (!ownerUserId) {
    return NextResponse.json(
      { error: "Owner is required (pick a user or enter their email)" },
      { status: 400 },
    );
  }

  const { data: ownerRow, error: ownerCheckError } = await auth.context.client
    .from("users")
    .select("id")
    .eq("id", ownerUserId)
    .maybeSingle();
  if (ownerCheckError) {
    return NextResponse.json({ error: ownerCheckError.message }, { status: 400 });
  }
  if (!ownerRow?.id) {
    return NextResponse.json({ error: "Owner user not found" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const publicIdBase =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "org";
  const publicId = `${publicIdBase}-${crypto.randomUUID().slice(0, 8)}`;

  const { data, error } = await auth.context.client
    .from("organizations")
    .insert({
      user_id: ownerUserId,
      name,
      organization_type: organizationType,
      country: body.country?.trim() || "Ethiopia",
      city: body.city?.trim() || "",
      currency: body.currency?.trim() || "ETB",
      description: body.description?.trim() || "",
      website: body.website?.trim() || null,
      verified: Boolean(body.verified),
      is_platform: false,
      public_id: publicId,
      images: [],
      created_at: now,
      updated_at: now,
    })
    .select("*, users:user_id(id, display_name, email, role)")
    .single();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ data });
}
