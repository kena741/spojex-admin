import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import {
  normalizeStadiumSurface,
  slugifyStadium,
  stadiumPricingPayload,
  type StadiumPricing,
  type StadiumSizeType,
} from "@/lib/stadiums";

type FieldRow = {
  name?: string;
  slug?: string;
  location?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  size_type?: string;
  surface?: string;
  capacity?: number;
  description?: string;
  owner_name?: string;
  contact_phone?: string;
  contact_email?: string;
  facilities?: string[];
  pricing?: StadiumPricing;
  status?: string;
  image_url?: string;
};

type ImportFile = {
  fields?: unknown[];
};

type AddisSportField = {
  id?: string;
  name?: string;
  surface?: string;
  category?: string;
  isActive?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  imageAbsoluteUrl?: string;
  imageUrl?: string;
  translations?: {
    en?: { name?: string; wereda?: string; subCity?: string; description?: string };
  };
  wereda?: {
    name?: string;
    subCity?: { name?: string };
  };
  bookingItems?: { price?: string | number; duration?: string }[];
};

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sizeFromSurface(surface?: string): StadiumSizeType {
  const key = (surface || "").trim().toLowerCase();
  if (key.includes("grass") && !key.includes("artificial")) return "medium";
  if (key.includes("ash")) return "small";
  return "mini";
}

function facilitiesFromAddis(field: AddisSportField): string[] {
  const out: string[] = [];
  const surface = (field.surface || "").trim();
  if (surface) out.push(surface === "Artificial" ? "Artificial turf" : surface);
  const cat = (field.category || "").trim().toUpperCase();
  if (cat === "ALL_AMENITIES") {
    out.push("Shower", "Toilet", "Grandstand", "Shade");
  } else if (cat === "SHOWER_RESTROOM") {
    out.push("Shower", "Toilet");
  } else if (cat === "GRANDSTAND_SHADE") {
    out.push("Grandstand", "Shade");
  }
  return [...new Set(out.filter(Boolean))];
}

function pricingFromBookingItems(items: AddisSportField["bookingItems"]): StadiumPricing {
  let session: number | null = null;
  for (const item of items || []) {
    const duration = `${item.duration || ""}`.toUpperCase();
    const price = Number(item.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (duration === "ONE_HOUR" || duration.includes("ONE")) {
      session = price;
      break;
    }
    if (session == null) session = price;
  }
  return {
    currency: "ETB",
    session,
    monthly: session != null ? Math.round(session * 20) : null,
    yearly: session != null ? Math.round(session * 20 * 10) : null,
  };
}

function normalizeField(raw: unknown): FieldRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  // Already in Spojex admin seed shape.
  if (typeof row.name === "string" && (row.slug || row.location || row.pricing || row.size_type)) {
    return row as FieldRow;
  }

  // AddisSport.gov.et API shape from addis-football-fields.json.
  const addis = raw as AddisSportField;
  const en = addis.translations?.en;
  const name = (en?.name || addis.name || "").trim();
  if (!name) return null;

  const subCity = (en?.subCity || addis.wereda?.subCity?.name || "").trim();
  const wereda = (en?.wereda || addis.wereda?.name || "").trim();
  const location = ["Addis Ababa", subCity].filter(Boolean).join(" · ");
  const addressParts = [subCity && `Subcity ${subCity}`, wereda && `Wereda ${wereda}`].filter(
    Boolean,
  );

  return {
    name,
    slug: slugifyStadium(name),
    location,
    address: addressParts.join(", "),
    latitude: numberOrNull(addis.latitude),
    longitude: numberOrNull(addis.longitude),
    size_type: sizeFromSurface(addis.surface),
    surface: normalizeStadiumSurface(addis.surface),
    capacity: 50,
    description: (en?.description || "").trim(),
    owner_name: "Addis Sport / Field Operator",
    contact_phone: "",
    contact_email: "",
    facilities: facilitiesFromAddis(addis),
    pricing: pricingFromBookingItems(addis.bookingItems),
    status: addis.isActive === false ? "inactive" : "active",
    image_url: (addis.imageAbsoluteUrl || "").trim(),
  };
}

async function loadFields(): Promise<FieldRow[]> {
  const filePath = path.join(process.cwd(), "data", "addis-football-fields.json");
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as ImportFile;
  const list = Array.isArray(parsed.fields) ? parsed.fields : [];
  return list.map(normalizeField).filter((row): row is FieldRow => Boolean(row?.name));
}

export async function POST() {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;

  let fields: FieldRow[];
  try {
    fields = await loadFields();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read addis-football-fields.json" },
      { status: 500 },
    );
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields in addis-football-fields.json" }, { status: 400 });
  }

  const client = auth.context.client;
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const field of fields) {
    const name = field.name?.trim() ?? "";
    if (!name) {
      errors.push({ name: "(missing)", error: "Name is required" });
      continue;
    }

    const slugBase = (field.slug?.trim() || slugifyStadium(name) || "stadium").toLowerCase();
    const status = ["pending", "active", "inactive", "rejected"].includes(field.status ?? "")
      ? (field.status as string)
      : "active";
    const pricing = field.pricing
      ? stadiumPricingPayload(field.pricing)
      : ({ currency: "ETB" } satisfies Record<string, unknown>);

    const payload: Record<string, unknown> = {
      name,
      slug: slugBase,
      status,
      size_type: field.size_type?.trim() || "medium",
      surface: normalizeStadiumSurface(field.surface),
      location: field.location?.trim() ?? "",
      address: field.address?.trim() ?? "",
      capacity: Math.max(0, Math.floor(Number(field.capacity) || 0)),
      description: field.description?.trim() ?? "",
      owner_name: field.owner_name?.trim() ?? "",
      contact_phone: field.contact_phone?.trim() ?? "",
      contact_email: field.contact_email?.trim() ?? "",
      latitude: numberOrNull(field.latitude),
      longitude: numberOrNull(field.longitude),
      facilities: Array.isArray(field.facilities)
        ? field.facilities.map((item) => `${item}`.trim()).filter(Boolean)
        : [],
      image_url: field.image_url?.trim() ?? "",
      pricing,
    };

    try {
      const existing = await client
        .from("stadiums")
        .select("id, slug, name")
        .eq("slug", slugBase)
        .maybeSingle();

      if (existing.error) {
        errors.push({ name, error: existing.error.message });
        continue;
      }

      if (existing.data?.id) {
        const { error } = await client
          .from("stadiums")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", existing.data.id);
        if (error) {
          errors.push({ name, error: error.message });
          continue;
        }
        updated.push(name);
        continue;
      }

      // Also match by exact name to avoid duplicates without slug.
      const byName = await client
        .from("stadiums")
        .select("id")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (byName.data?.id) {
        const { error } = await client
          .from("stadiums")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", byName.data.id);
        if (error) {
          skipped.push(name);
          continue;
        }
        updated.push(name);
        continue;
      }

      const { data, error } = await client.from("stadiums").insert(payload).select("id").single();
      if (error) {
        const hint = missingServiceRoleMessage();
        errors.push({
          name,
          error: hint ? `${error.message}. ${hint}` : error.message,
        });
        continue;
      }

      const hours = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
        stadium_id: data.id,
        day_of_week: day,
        start_time: "06:00",
        end_time: "22:00",
        is_blocked: false,
        notes: "",
      }));
      await client.from("stadium_availability").insert(hours);
      created.push(name);
    } catch (err) {
      errors.push({
        name,
        error: err instanceof Error ? err.message : "Import failed",
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    total: fields.length,
    created: created.length,
    updated: updated.length,
    skipped: skipped.length,
    errors,
    created_names: created,
    updated_names: updated,
  });
}
