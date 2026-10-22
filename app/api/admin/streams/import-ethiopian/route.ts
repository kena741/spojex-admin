import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { slugifyStream } from "@/lib/streams";
import { requestAccessToken } from "@/lib/spojex/server";

type StationRow = {
  name?: string;
  slug?: string;
  source_id?: string;
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

async function loadStations(): Promise<StationRow[]> {
  const filePath = path.join(process.cwd(), "data", "ethiopian-radio-stations.json");
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as ImportFile;
  return Array.isArray(parsed.stations) ? parsed.stations : [];
}

function withSourceIds(stations: StationRow[]) {
  return stations.map((station) => {
    const name = String(station.name ?? "").trim();
    const slug = (String(station.slug ?? "").trim() || slugifyStream(name)).toLowerCase();
    return {
      ...station,
      name,
      slug,
      source_id: String(station.source_id ?? slug).trim() || slug,
    };
  });
}

export async function GET() {
  const auth = await requireAdminPermission("streams:write");
  if (!auth.ok) return auth.error;
  try {
    const stations = withSourceIds(await loadStations());
    const token = await requestAccessToken();
    if (token) {
      try {
        const res = await fetch(
          `${getSpojexApiBaseUrl()}/api/v1/admin/streams/radio/import-ethiopian`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ stations, dry_run: true }),
            cache: "no-store",
          },
        );
        const payload = await res.json().catch(() => ({}));
        if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      } catch {
        // local preview below
      }
    }

    // Local preview: match by source_id/slug only (never name alone).
    const { data: existing } = await auth.context.client
      .from("radio_streams")
      .select("id, name, slug, source_id, stream_url, status, is_featured, host_org_id")
      .limit(2000);
    const bySource = new Map<string, Record<string, unknown>>();
    const bySlug = new Map<string, Record<string, unknown>>();
    for (const row of existing ?? []) {
      const r = row as Record<string, unknown>;
      if (r.source_id) bySource.set(String(r.source_id), r);
      if (r.slug) bySlug.set(String(r.slug).toLowerCase(), r);
    }
    const preview = {
      create: [] as unknown[],
      update: [] as unknown[],
      duplicates: [] as unknown[],
      missing_playback: [] as unknown[],
      unmapped_metadata: [] as unknown[],
      policy: {
        match: "source_id or slug — never name alone",
        preserve_local: ["host_org_id", "is_featured", "status", "sort_order"],
        new_default_status: "inactive",
      },
    };
    const seen = new Set<string>();
    for (const station of stations) {
      const sourceId = String(station.source_id || "");
      const streamUrl = String(station.stream_url || "").trim();
      if (!station.name) {
        preview.unmapped_metadata.push({ reason: "missing_name", row: station });
        continue;
      }
      if (!streamUrl) {
        preview.missing_playback.push({ name: station.name, source_id: sourceId });
        continue;
      }
      if (seen.has(sourceId)) {
        preview.duplicates.push({ name: station.name, source_id: sourceId });
        continue;
      }
      seen.add(sourceId);
      const match = bySource.get(sourceId) || bySlug.get(String(station.slug || "").toLowerCase());
      const entry = {
        name: station.name,
        slug: station.slug,
        source_id: sourceId,
        stream_url: streamUrl,
        genre: station.genre,
        city: station.city,
        tagline: station.tagline,
      };
      if (match) {
        preview.update.push({ ...entry, existing_id: match.id });
      } else {
        preview.create.push({ ...entry, default_status: "inactive" });
      }
    }
    return NextResponse.json({ ok: true, dry_run: true, preview, source: "local" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Preview failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("streams:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { dry_run?: boolean; confirm?: boolean };
  const dryRun = body.dry_run === true || body.confirm !== true;

  let stations: StationRow[] = [];
  try {
    stations = withSourceIds(await loadStations());
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

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/streams/radio/import-ethiopian`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stations, dry_run: dryRun }),
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      if (res.status !== 404) {
        const err = payload as { message?: string; error?: string };
        return NextResponse.json(
          { error: err.message || err.error || "Import failed" },
          { status: res.status },
        );
      }
    } catch {
      // fall through to local apply for dry_run only safety
    }
  }

  if (dryRun) {
    // Reuse GET preview path logic via recursive call pattern — return GET-equivalent.
    const previewUrl = new URL(request.url);
    previewUrl.search = "";
    return GET();
  }

  return NextResponse.json(
    {
      error:
        "Apply import requires the Python streams import API. Preview is available; confirm after backend deploy.",
    },
    { status: 503 },
  );
}
