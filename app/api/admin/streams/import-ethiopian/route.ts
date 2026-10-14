import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { slugifyStream } from "@/lib/streams";

type StationRow = {
  name?: string;
  slug?: string;
  tagline?: string;
  stream_url?: string;
  website_url?: string;
  image_url?: string;
  genre?: string;
  city?: string;
  status?: string;
  is_featured?: boolean;
  sort_order?: number;
};

type ImportFile = {
  stations?: StationRow[];
};

function normName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function POST() {
  const auth = await requireAdminPermission("streams:write");
  if (!auth.ok) return auth.error;

  let stations: StationRow[] = [];
  try {
    const filePath = path.join(process.cwd(), "data", "ethiopian-radio-stations.json");
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ImportFile;
    stations = Array.isArray(parsed.stations) ? parsed.stations : [];
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Could not read station list: ${err.message}`
            : "Could not read station list",
      },
      { status: 500 },
    );
  }

  if (stations.length === 0) {
    return NextResponse.json({ error: "No stations in import file" }, { status: 400 });
  }

  const { data: existingRows, error: listError } = await auth.context.client
    .from("radio_streams")
    .select("id, name, slug")
    .limit(2000);
  if (listError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${listError.message}. ${hint}` : listError.message },
      { status: 400 },
    );
  }

  const byName = new Map<string, { id: string; name: string; slug: string | null }>();
  for (const row of existingRows ?? []) {
    const key = normName(String((row as { name?: string }).name ?? ""));
    if (key) byName.set(key, row as { id: string; name: string; slug: string | null });
  }

  let hostOrgId: string | null = null;
  {
    const { data: platformOrg } = await auth.context.client
      .from("organizations")
      .select("id")
      .eq("is_platform", true)
      .limit(1)
      .maybeSingle();
    hostOrgId = platformOrg?.id ?? null;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { name: string; error: string }[] = [];

  for (const station of stations) {
    const name = String(station.name ?? "").trim();
    const streamUrl = String(station.stream_url ?? "").trim();
    if (!name || !streamUrl) {
      skipped += 1;
      continue;
    }

    const slug = (String(station.slug ?? "").trim() || slugifyStream(name)).toLowerCase();
    const payload: Record<string, unknown> = {
      name,
      slug,
      tagline: String(station.tagline ?? ""),
      stream_url: streamUrl,
      website_url: String(station.website_url ?? ""),
      image_url: String(station.image_url ?? ""),
      genre: String(station.genre ?? "Live radio"),
      city: String(station.city ?? "Addis Ababa"),
      status: String(station.status ?? "active"),
      is_featured: station.is_featured === true,
      sort_order: Number.isFinite(Number(station.sort_order))
        ? Number(station.sort_order)
        : 0,
    };
    if (hostOrgId) payload.host_org_id = hostOrgId;

    const existing = byName.get(normName(name));
    try {
      if (existing) {
        // Match by name only — never reuse SQL file ids.
        let patch = await auth.context.client
          .from("radio_streams")
          .update(payload)
          .eq("id", existing.id)
          .select("id")
          .maybeSingle();
        if (
          patch.error &&
          hostOrgId &&
          /host_org_id|column .* does not exist/i.test(patch.error.message)
        ) {
          const { host_org_id: _drop, ...withoutOrg } = payload;
          patch = await auth.context.client
            .from("radio_streams")
            .update(withoutOrg)
            .eq("id", existing.id)
            .select("id")
            .maybeSingle();
        }
        if (patch.error) {
          errors.push({ name, error: patch.error.message });
          continue;
        }
        updated += 1;
      } else {
        let insert = await auth.context.client
          .from("radio_streams")
          .insert(payload)
          .select("id, name")
          .single();
        if (
          insert.error &&
          hostOrgId &&
          /host_org_id|column .* does not exist/i.test(insert.error.message)
        ) {
          const { host_org_id: _drop, ...withoutOrg } = payload;
          insert = await auth.context.client
            .from("radio_streams")
            .insert(withoutOrg)
            .select("id, name")
            .single();
        }
        if (insert.error) {
          errors.push({ name, error: insert.error.message });
          continue;
        }
        const row = insert.data as { id: string; name: string };
        byName.set(normName(name), { id: row.id, name: row.name, slug });
        created += 1;
      }
    } catch (err) {
      errors.push({
        name,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    updated,
    skipped,
    errors,
    total: stations.length,
  });
}
