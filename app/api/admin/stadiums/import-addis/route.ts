import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { slugifyStadium, stadiumPricingPayload, type StadiumPricing } from "@/lib/stadiums";

type FieldRow = {
  name?: string;
  slug?: string;
  location?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  size_type?: string;
  capacity?: number;
  description?: string;
  owner_name?: string;
  contact_phone?: string;
  contact_email?: string;
  facilities?: string[];
  pricing?: StadiumPricing;
  status?: string;
};

type ImportFile = {
  fields?: FieldRow[];
};

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadFields(): Promise<FieldRow[]> {
  const filePath = path.join(process.cwd(), "data", "addis-football-fields.json");
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as ImportFile;
  return Array.isArray(parsed.fields) ? parsed.fields : [];
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
      image_url: "",
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
        skipped.push(name);
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
