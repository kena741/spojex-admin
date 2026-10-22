import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import {
  addisSubcityByName,
  normalizeWereda,
} from "@/lib/addis-ababa-locations";
import {
  normalizeStadiumFacilities,
  normalizeStadiumSurface,
  slugifyStadium,
  stadiumPricingPayload,
  type StadiumPricing,
  type StadiumSizeType,
} from "@/lib/stadiums";

type FieldRow = {
  external_id?: string | null;
  name?: string;
  slug?: string;
  location?: string;
  address?: string;
  subcity?: string;
  wereda?: number | null;
  location_review_needed?: boolean;
  location_review_reason?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  size_type?: string;
  surface?: string;
  capacity?: number | null;
  description?: string;
  owner_name?: string;
  contact_phone?: string;
  contact_email?: string;
  facilities?: string[];
  pricing?: StadiumPricing;
  status?: string;
  image_url?: string;
  unmapped?: string[];
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
    am?: { name?: string; wereda?: string; subCity?: string; description?: string };
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
    out.push("Showers", "Toilets", "Grandstand", "Shade");
  } else if (cat === "SHOWER_RESTROOM") {
    out.push("Showers", "Toilets");
  } else if (cat === "GRANDSTAND_SHADE") {
    out.push("Grandstand", "Shade");
  }
  return normalizeStadiumFacilities(out);
}

function pricingFromBookingItems(items: AddisSportField["bookingItems"]): StadiumPricing {
  let hourly: number | null = null;
  for (const item of items || []) {
    const duration = `${item.duration || ""}`.toUpperCase();
    const price = Number(item.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (duration === "ONE_HOUR" || duration.includes("ONE")) {
      hourly = price;
      break;
    }
    if (hourly == null) hourly = price;
  }
  // Only import hourly when present — do not invent daily/monthly/yearly multipliers.
  return {
    currency: "ETB",
    hourly,
    daily: null,
    monthly: null,
    yearly: null,
  };
}

function mapLocation(subCityRaw: string, weredaRaw: string): {
  subcity: string;
  wereda: number | null;
  location_review_needed: boolean;
  location_review_reason: string | null;
  location: string;
  address: string;
} {
  const sub = addisSubcityByName(subCityRaw);
  const wereda = normalizeWereda(weredaRaw);
  let location_review_needed = false;
  let location_review_reason: string | null = null;

  if (subCityRaw && !sub) {
    location_review_needed = true;
    location_review_reason = `Unmapped sub-city “${subCityRaw}”`;
  } else if (sub && wereda != null && wereda > sub.weredaCount) {
    location_review_needed = true;
    location_review_reason = `Woreda ${wereda} exceeds ${sub.name} max (${sub.weredaCount})`;
  } else if (weredaRaw && wereda == null) {
    location_review_needed = true;
    location_review_reason = `Could not parse woreda “${weredaRaw}”`;
  }

  const subcity = sub?.name || "";
  const location = ["Addis Ababa", subcity || subCityRaw].filter(Boolean).join(" · ");
  const addressParts = [
    (subcity || subCityRaw) && `Subcity ${subcity || subCityRaw}`,
    wereda != null ? `Wereda ${wereda}` : weredaRaw ? `Wereda ${weredaRaw}` : "",
  ].filter(Boolean);

  return {
    subcity,
    wereda: location_review_needed && !sub ? null : wereda,
    location_review_needed,
    location_review_reason,
    location,
    address: addressParts.join(", "),
  };
}

function normalizeField(raw: unknown): FieldRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  if (typeof row.name === "string" && (row.slug || row.location || row.pricing || row.size_type)) {
    return row as FieldRow;
  }

  const addis = raw as AddisSportField;
  const en = addis.translations?.en;
  const name = (en?.name || addis.name || "").trim();
  if (!name) return null;

  const subCity = (en?.subCity || addis.wereda?.subCity?.name || "").trim();
  const weredaText = (en?.wereda || addis.wereda?.name || "").trim();
  const loc = mapLocation(subCity, weredaText);
  const unmapped: string[] = [];
  if (loc.location_review_reason) unmapped.push(loc.location_review_reason);
  if (addis.translations?.am?.name) unmapped.push("Amharic name preserved in import only (not stored)");

  return {
    external_id: addis.id ? String(addis.id) : null,
    name,
    slug: slugifyStadium(name),
    location: loc.location,
    address: loc.address,
    subcity: loc.subcity,
    wereda: loc.wereda,
    location_review_needed: loc.location_review_needed,
    location_review_reason: loc.location_review_reason,
    latitude: numberOrNull(addis.latitude),
    longitude: numberOrNull(addis.longitude),
    size_type: sizeFromSurface(addis.surface),
    surface: normalizeStadiumSurface(addis.surface),
    // Do not invent capacity — leave unset (null → omit on update / 0 only on create default).
    capacity: null,
    description: (en?.description || "").trim(),
    // Operator display label only — not an account owner.
    owner_name: "",
    contact_phone: "",
    contact_email: "",
    facilities: facilitiesFromAddis(addis),
    pricing: pricingFromBookingItems(addis.bookingItems),
    status: addis.isActive === false ? "inactive" : "active",
    image_url: (addis.imageAbsoluteUrl || "").trim(),
    unmapped,
  };
}

async function loadFields(): Promise<FieldRow[]> {
  const filePath = path.join(process.cwd(), "data", "addis-football-fields.json");
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as ImportFile;
  const list = Array.isArray(parsed.fields) ? parsed.fields : [];
  return list.map(normalizeField).filter((row): row is FieldRow => Boolean(row?.name));
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const preview = url.searchParams.get("preview") === "true";
  const overwriteLocal = url.searchParams.get("overwrite_local") === "true";

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
  const conflicts: { name: string; reason: string }[] = [];
  const errors: { name: string; error: string }[] = [];
  const previewRows: Record<string, unknown>[] = [];

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

    const nowIso = new Date().toISOString();
    const payload: Record<string, unknown> = {
      name,
      slug: slugBase,
      status,
      size_type: field.size_type?.trim() || "medium",
      surface: normalizeStadiumSurface(field.surface),
      location: field.location?.trim() ?? "",
      address: field.address?.trim() ?? "",
      subcity: field.subcity?.trim() ?? "",
      wereda: field.wereda ?? null,
      description: field.description?.trim() ?? "",
      latitude: numberOrNull(field.latitude),
      longitude: numberOrNull(field.longitude),
      facilities: normalizeStadiumFacilities(field.facilities ?? []),
      image_url: field.image_url?.trim() ?? "",
      external_id: field.external_id || null,
      import_source: "addis_sport",
      imported_at: nowIso,
      location_review_needed: field.location_review_needed === true,
    };
    if (field.capacity != null && field.capacity > 0) {
      payload.capacity = Math.floor(field.capacity);
    }

    try {
      type ExistingStadium = {
        id: string;
        pricing?: unknown;
        owner_user_id?: string | null;
        status?: string;
      };
      let existing: ExistingStadium | null = null;

      if (field.external_id) {
        const byExt = await client
          .from("stadiums")
          .select("id, pricing, owner_user_id, status")
          .eq("external_id", field.external_id)
          .maybeSingle();
        if (!byExt.error && byExt.data) existing = byExt.data as ExistingStadium;
      }
      if (!existing) {
        const bySlug = await client
          .from("stadiums")
          .select("id, pricing, owner_user_id, status")
          .eq("slug", slugBase)
          .maybeSingle();
        if (!bySlug.error && bySlug.data) existing = bySlug.data as ExistingStadium;
      }

      if (preview) {
        previewRows.push({
          name,
          external_id: field.external_id,
          action: existing ? "update" : "create",
          location_review_needed: field.location_review_needed,
          location_review_reason: field.location_review_reason,
          unmapped: field.unmapped ?? [],
          preserve_local_pricing: Boolean(existing && !overwriteLocal),
          preserve_owner: Boolean(existing?.owner_user_id),
        });
        continue;
      }

      if (existing?.id) {
        const updatePayload: Record<string, unknown> = { ...payload, updated_at: nowIso };
        // Preserve local ownership, status, and pricing unless explicitly overwritten.
        if (!overwriteLocal) {
          delete updatePayload.status;
          if (existing.owner_user_id) {
            delete updatePayload.owner_name;
          }
          // Keep existing pricing — never silently rewrite product prices on re-import.
          delete updatePayload.pricing;
        } else {
          updatePayload.pricing = pricing;
        }

        const { error } = await client
          .from("stadiums")
          .update(updatePayload)
          .eq("id", existing.id);
        if (error) {
          // Columns may be missing before migration — retry without new fields.
          if (/external_id|import_source|imported_at|location_review/i.test(error.message)) {
            const legacy: Record<string, unknown> = { ...updatePayload };
            delete legacy.external_id;
            delete legacy.import_source;
            delete legacy.imported_at;
            delete legacy.location_review_needed;
            const retry = await client.from("stadiums").update(legacy).eq("id", existing.id);
            if (retry.error) {
              errors.push({ name, error: retry.error.message });
              continue;
            }
            updated.push(name);
            continue;
          }
          errors.push({ name, error: error.message });
          continue;
        }
        updated.push(name);
        continue;
      }

      const insertPayload = {
        ...payload,
        pricing,
        capacity: field.capacity != null && field.capacity > 0 ? Math.floor(field.capacity) : 0,
        owner_name: "",
        contact_phone: "",
        contact_email: "",
      };
      const { data, error } = await client.from("stadiums").insert(insertPayload).select("id").single();
      if (error) {
        const hint = missingServiceRoleMessage();
        // Retry without migration columns.
        if (/external_id|import_source|imported_at|location_review/i.test(error.message)) {
          const legacy = { ...insertPayload } as Record<string, unknown>;
          delete legacy.external_id;
          delete legacy.import_source;
          delete legacy.imported_at;
          delete legacy.location_review_needed;
          const retry = await client.from("stadiums").insert(legacy).select("id").single();
          if (retry.error) {
            errors.push({
              name,
              error: hint ? `${retry.error.message}. ${hint}` : retry.error.message,
            });
            continue;
          }
          const hours = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
            stadium_id: retry.data.id,
            day_of_week: day,
            start_time: "06:00",
            end_time: "22:00",
            is_blocked: false,
            notes: "",
          }));
          await client.from("stadium_availability").insert(hours);
          created.push(name);
          continue;
        }
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

  if (preview) {
    return NextResponse.json({
      preview: true,
      total: fields.length,
      creates: previewRows.filter((r) => r.action === "create").length,
      updates: previewRows.filter((r) => r.action === "update").length,
      location_reviews: previewRows.filter((r) => r.location_review_needed).length,
      rows: previewRows,
      policy: {
        overwrite_local: overwriteLocal,
        preserves: [
          "pricing (unless overwrite_local)",
          "owner_user_id",
          "status (unless overwrite_local)",
        ],
        does_not_invent: ["capacity", "contact details", "daily/monthly/yearly prices"],
      },
    });
  }

  return NextResponse.json({
    ok: errors.length === 0,
    total: fields.length,
    created: created.length,
    updated: updated.length,
    skipped: skipped.length,
    conflicts,
    errors,
    created_names: created,
    updated_names: updated,
    policy: {
      overwrite_local: overwriteLocal,
      note: "Re-import preserves local pricing, ownership, and status unless overwrite_local=true.",
    },
  });
}
