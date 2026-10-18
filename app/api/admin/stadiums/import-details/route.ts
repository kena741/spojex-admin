import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import {
  normalizeStadiumSurface,
  slugifyStadium,
  stadiumPricingPayload,
  type StadiumSizeType,
} from "@/lib/stadiums";
import { imageExtension, uploadViaSpojexMediaApi } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

type ImageIndexRow = {
  id?: string;
  name?: string;
  filename?: string;
  sourceUrl?: string;
  status?: string;
};

type DetailStadium = {
  id?: string;
  name?: string;
  isActive?: boolean;
  amenities?: string[];
  description?: string;
  surface?: string;
  latitude?: number | null;
  longitude?: number | null;
  imageUrl?: string;
  category?: string;
  location?: { wereda?: string; subCity?: string };
  translations?: {
    en?: {
      name?: string;
      wereda?: string;
      subCity?: string;
      description?: string;
    };
  };
};

type DetailsFile = {
  stadiums?: DetailStadium[];
};

const START_NAME = "Chefe Multipurpose Sports Center";

function sizeFromSurface(surface?: string): StadiumSizeType {
  const key = (surface || "").trim().toLowerCase();
  if (key.includes("grass") && !key.includes("artificial")) return "medium";
  if (key.includes("ash")) return "small";
  return "mini";
}

function mimeFromName(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function locationParts(row: DetailStadium) {
  const en = row.translations?.en;
  const subCity = (row.location?.subCity || en?.subCity || "").trim();
  const weredaRaw = (row.location?.wereda || "").trim();
  const weredaNum = (en?.wereda || "").trim();
  const wereda =
    weredaRaw ||
    (weredaNum ? (weredaNum.toLowerCase().startsWith("wereda") ? weredaNum : `Wereda ${weredaNum}`) : "");
  return { subCity, wereda };
}

function buildLocation(row: DetailStadium) {
  const { subCity, wereda } = locationParts(row);
  return [subCity, wereda].filter(Boolean).join(" · ");
}

function buildAddress(row: DetailStadium) {
  const { subCity, wereda } = locationParts(row);
  const parts = [
    subCity && `Subcity ${subCity}`,
    wereda && wereda,
  ].filter(Boolean);
  return parts.join(", ");
}

async function loadDetails(): Promise<DetailStadium[]> {
  const filePath = path.join(process.cwd(), "data", "stadium-details-no-prices.json");
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as DetailsFile;
  return Array.isArray(parsed.stadiums) ? parsed.stadiums : [];
}

async function loadImageIndex(): Promise<Map<string, ImageIndexRow>> {
  const map = new Map<string, ImageIndexRow>();
  try {
    const filePath = path.join(
      process.cwd(),
      "data",
      "addis-field-images",
      "field-image-index.json",
    );
    const raw = await readFile(filePath, "utf8");
    const rows = JSON.parse(raw) as ImageIndexRow[];
    for (const row of rows) {
      if (row.id) map.set(row.id, row);
      if (row.name) map.set(row.name.toLowerCase(), row);
    }
  } catch {
    /* optional */
  }
  return map;
}

async function resolveImageBytes(
  row: DetailStadium,
  index: Map<string, ImageIndexRow>,
): Promise<{ bytes: Buffer; filename: string; mime: string } | null> {
  const indexed =
    (row.id && index.get(row.id)) ||
    (row.name && index.get(row.name.toLowerCase())) ||
    null;

  const candidates: string[] = [];
  if (indexed?.filename) {
    // Optional absolute override (keeps Turbopack from tracing out-of-tree symlinks).
    const externalDir = (process.env.ADDIS_FIELD_IMAGES_DIR || "").trim();
    if (externalDir) {
      candidates.push(path.join(externalDir, indexed.filename));
    }
    candidates.push(
      path.join(process.cwd(), "data", "addis-field-images", indexed.filename),
    );
  }

  for (const filePath of candidates) {
    try {
      const bytes = await readFile(filePath);
      if (bytes.length > 0) {
        const filename = path.basename(filePath);
        return { bytes, filename, mime: mimeFromName(filename) };
      }
    } catch {
      /* try next */
    }
  }

  const remote = (row.imageUrl || indexed?.sourceUrl || "").trim();
  if (!remote) return null;
  try {
    const res = await fetch(remote);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const bytes = Buffer.from(ab);
    const filename =
      indexed?.filename ||
      remote.split("/").pop()?.split("?")[0] ||
      `stadium-${Date.now()}.jpg`;
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || mimeFromName(filename);
    return { bytes, filename, mime };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;

  let body: { fromName?: string; replaceFrom?: boolean } = {};
  try {
    body = (await request.json()) as { fromName?: string; replaceFrom?: boolean };
  } catch {
    body = {};
  }

  const fromName = (body.fromName || START_NAME).trim();
  const replaceFrom = body.replaceFrom !== false;

  let stadiums: DetailStadium[];
  try {
    stadiums = await loadDetails();
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not read stadium-details-no-prices.json",
      },
      { status: 500 },
    );
  }

  const startIdx = stadiums.findIndex(
    (row) => (row.name || row.translations?.en?.name || "").trim() === fromName,
  );
  if (startIdx < 0) {
    return NextResponse.json(
      { error: `Start stadium not found: ${fromName}` },
      { status: 400 },
    );
  }

  const slice = stadiums.slice(startIdx);
  const imageIndex = await loadImageIndex();
  const token = await requestAccessToken();
  const client = auth.context.client;

  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const imageUploaded: string[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const field of slice) {
    const name = (field.name || field.translations?.en?.name || "").trim();
    if (!name) {
      errors.push({ name: "(missing)", error: "Name is required" });
      continue;
    }

    const slugBase = (slugifyStadium(name) || "stadium").toLowerCase();
    const description =
      (field.description || field.translations?.en?.description || "").trim();
    const facilities = Array.isArray(field.amenities)
      ? field.amenities.map((item) => `${item}`.trim()).filter(Boolean)
      : [];
    const surface = normalizeStadiumSurface(field.surface);
    const location = buildLocation(field);
    const address = buildAddress(field);
    const status = field.isActive === false ? "inactive" : "active";

    const payload: Record<string, unknown> = {
      name,
      slug: slugBase,
      status,
      size_type: sizeFromSurface(field.surface),
      surface,
      location,
      address,
      description,
      facilities,
      latitude: field.latitude ?? null,
      longitude: field.longitude ?? null,
    };

    try {
      const existing = await client
        .from("stadiums")
        .select("id, slug, name, pricing, capacity, owner_name, contact_phone, contact_email, image_url, photos")
        .eq("slug", slugBase)
        .maybeSingle();

      let stadiumId = existing.data?.id as string | undefined;

      if (existing.data?.id && replaceFrom) {
        // Refresh mapped fields; keep pricing / capacity / contacts when empty in source.
        const patch: Record<string, unknown> = {
          ...payload,
          capacity: existing.data.capacity ?? 50,
          owner_name: existing.data.owner_name || "Addis Sport / Field Operator",
          contact_phone: existing.data.contact_phone || "",
          contact_email: existing.data.contact_email || "",
          pricing: existing.data.pricing ?? stadiumPricingPayload({
            currency: "ETB",
            hourly: null,
            daily: null,
            monthly: null,
            yearly: null,
          }),
        };
        const { data, error } = await client
          .from("stadiums")
          .update(patch)
          .eq("id", existing.data.id)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        stadiumId = data?.id ?? existing.data.id;
        updated.push(name);
      } else if (!existing.data) {
        const insert = {
          ...payload,
          capacity: 50,
          owner_name: "Addis Sport / Field Operator",
          contact_phone: "",
          contact_email: "",
          image_url: "",
          photos: [],
          pricing: stadiumPricingPayload({
            currency: "ETB",
            hourly: null,
            daily: null,
            monthly: null,
            yearly: null,
          }),
        };
        const { data, error } = await client
          .from("stadiums")
          .insert(insert)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        stadiumId = data.id as string;
        created.push(name);

        // Default hours like create route.
        const hours = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
          stadium_id: stadiumId,
          day_of_week: day,
          start_time: "06:00",
          end_time: "22:00",
          is_blocked: false,
          notes: "",
        }));
        await client.from("stadium_availability").insert(hours);
      } else {
        stadiumId = existing.data.id as string;
        updated.push(name);
      }

      if (stadiumId && token) {
        const image = await resolveImageBytes(field, imageIndex);
        if (image) {
          try {
            const blob = new Blob([new Uint8Array(image.bytes)], {
              type: image.mime,
            });
            const uploaded = await uploadViaSpojexMediaApi({
              accessToken: token,
              file: blob,
              filename: `cover-${Date.now()}.${imageExtension(image.mime, image.filename)}`,
              module: "stadiums",
              folder: "stadiums",
              kind: "cover",
            });
            if (uploaded.publicUrl) {
              await client
                .from("stadiums")
                .update({
                  image_url: uploaded.publicUrl,
                  photos: [uploaded.publicUrl],
                })
                .eq("id", stadiumId);
              imageUploaded.push(name);
            }
          } catch (imgErr) {
            errors.push({
              name,
              error: `image: ${imgErr instanceof Error ? imgErr.message : "upload failed"}`,
            });
          }
        }
      }
    } catch (err) {
      const hint = missingServiceRoleMessage();
      const message = err instanceof Error ? err.message : "Save failed";
      errors.push({
        name,
        error: hint ? `${message}. ${hint}` : message,
      });
    }
  }

  return NextResponse.json({
    fromName,
    processed: slice.length,
    created: created.length,
    updated: updated.length,
    deleted: deleted.length,
    images: imageUploaded.length,
    createdNames: created.slice(0, 20),
    updatedNames: updated.slice(0, 20),
    errors,
  });
}
