import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import {
  normalizeStadiumSurface,
  slugifyStadium,
  stadiumPricingPayload,
  type StadiumPricing,
} from "@/lib/stadiums";

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    name?: string;
    status?: string;
    size_type?: string;
    surface?: string;
    location?: string;
    address?: string;
    capacity?: number;
    description?: string;
    owner_name?: string;
    owner_user_id?: string | null;
    contact_phone?: string;
    contact_email?: string;
    latitude?: number | null;
    longitude?: number | null;
    facilities?: string[];
    pricing?: StadiumPricing;
  };

  const name = body.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slugBase = slugifyStadium(name) || "stadium";
  const slug = `${slugBase}-${Date.now().toString(36).slice(-4)}`;
  const status = ["pending", "active", "inactive", "rejected"].includes(body.status ?? "")
    ? body.status
    : "pending";

  // photos is JSONB array; pricing is JSONB object.
  // Omit empty `photos: []` so create still works if an older API build still
  // types JSONB as dict ("Input should be a valid dictionary"). Backend insert
  // defaults / DB default fill photos after deploy.
  const pricing = body.pricing
    ? stadiumPricingPayload(body.pricing)
    : ({ currency: "ETB" } satisfies Record<string, unknown>);
  const insert: Record<string, unknown> = {
    name,
    slug,
    status,
    size_type: body.size_type?.trim() || "medium",
    surface: normalizeStadiumSurface(body.surface),
    location: body.location?.trim() ?? "",
    address: body.address?.trim() ?? "",
    capacity: Math.max(0, Math.floor(Number(body.capacity) || 0)),
    description: body.description?.trim() ?? "",
    owner_name: body.owner_name?.trim() ?? "",
    owner_user_id: body.owner_user_id || null,
    contact_phone: body.contact_phone?.trim() ?? "",
    contact_email: body.contact_email?.trim() ?? "",
    latitude: numberOrNull(body.latitude),
    longitude: numberOrNull(body.longitude),
    facilities: Array.isArray(body.facilities)
      ? body.facilities.map((item) => `${item}`.trim()).filter(Boolean)
      : [],
    image_url: "",
    pricing,
  };

  const { data, error } = await auth.context.client.from("stadiums").insert(insert).select().single();
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }

  // notes is NOT NULL on stadium_availability — omit → Internal Server Error.
  const hours = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
    stadium_id: data.id,
    day_of_week: day,
    start_time: "06:00",
    end_time: "22:00",
    is_blocked: false,
    notes: "",
  }));
  const { error: hoursError } = await auth.context.client
    .from("stadium_availability")
    .insert(hours);
  if (hoursError) {
    // Stadium row already created; surface hours failure so admin can retry Hours tab.
    return NextResponse.json(
      {
        data,
        warning: `Stadium created but default hours failed: ${hoursError.message}`,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ data });
}
