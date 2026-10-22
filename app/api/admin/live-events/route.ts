import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import {
  asInt,
  asText,
  defaultStreamKind,
  liveEventKindIds,
  liveEventStatusIds,
  liveStreamKindIds,
  slugifyLiveEvent,
} from "@/lib/live-events";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission(["events:read", "streams:read"]);
  if (!auth.ok) return auth.error;

  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of ["q", "status", "lane", "kind", "page", "page_size", "sort", "order"]) {
    const value = searchParams.get(key);
    if (value) qs.set(key, value);
  }

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/streams/live-events?${qs.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        return NextResponse.json({ ...payload, source: "python" });
      }
    } catch {
      // fall through to local Supabase
    }
  }

  let query = auth.context.client
    .from("live_events")
    .select("*")
    .order("starts_at", { ascending: false })
    .limit(200);
  const status = searchParams.get("status");
  const lane = searchParams.get("lane");
  const kind = searchParams.get("kind");
  if (status && status !== "all") query = query.eq("status", status);
  if (kind && kind !== "all") query = query.eq("kind", kind);
  if (lane === "live_now") query = query.in("status", ["live", "connecting", "reconnecting", "suspended"]);
  if (lane === "upcoming") query = query.in("status", ["draft", "scheduled", "postponed"]);
  if (lane === "ended") query = query.eq("status", "finished");
  if (lane === "failed") query = query.eq("status", "failed");
  if (lane === "cancelled") query = query.eq("status", "cancelled");

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [], source: "local" });
}

export async function POST(request: Request) {
  const auth = await requireAnyAdminPermission(["events:write", "streams:write"]);
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as Record<string, unknown>;
  const name = asText(body.name);
  const kind = asText(body.kind) || "stream";
  const startsAt = asText(body.starts_at);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!liveEventKindIds.has(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (!startsAt) return NextResponse.json({ error: "Start time is required" }, { status: 400 });
  const status = asText(body.status);
  const streamKind = asText(body.stream_kind) || defaultStreamKind(kind);
  if (status && !liveEventStatusIds.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (!liveStreamKindIds.has(streamKind)) {
    return NextResponse.json({ error: "Invalid stream kind" }, { status: 400 });
  }

  const slugBase = slugifyLiveEvent(name) || "live-event";

  // Default host to Spojex platform org (gifts + follow) when not overridden.
  let hostOrgId = asText(body.host_org_id) || null;
  if (!hostOrgId) {
    const { data: platform } = await auth.context.client
      .from("organizations")
      .select("id")
      .eq("is_platform", true)
      .maybeSingle();
    hostOrgId = platform?.id ?? null;
  }

  const organizer = asText(body.organizer) || (hostOrgId ? "Spojex" : "");

  const sourceTypeRaw = asText(body.source_type) || "external_url";
  const sourceType =
    sourceTypeRaw === "mock_dev"
      ? "mock_dev"
      : sourceTypeRaw === "ingest"
        ? "external_url" // ingest not available - fall back
        : "external_url";
  const visibility = asText(body.visibility) === "private" ? "private" : "public";
  const timezone = asText(body.timezone) || "Africa/Addis_Ababa";
  const streamUrl = asText(body.stream_url);
  const sourceReady =
    body.source_ready === true || (sourceType !== "mock_dev" && Boolean(streamUrl));

  if (sourceTypeRaw === "ingest") {
    return NextResponse.json(
      {
        error:
          "Broadcaster ingest is not available yet. Use an external playback URL or a development mock source.",
      },
      { status: 400 },
    );
  }

  const baseRow = {
    name,
    kind,
    slug: `${slugBase}-${Date.now().toString(36).slice(-6)}`,
    starts_at: startsAt,
    ends_at: asText(body.ends_at) || null,
    status: status && liveEventStatusIds.has(status) ? status : "scheduled",
    thumbnail_url: asText(body.thumbnail_url),
    stream_url: streamUrl,
    stream_kind: streamKind,
    replay_url: asText(body.replay_url),
    location: asText(body.location),
    organizer,
    competition: asText(body.competition),
    stadium: asText(body.stadium),
    home_name: asText(body.home_name),
    away_name: asText(body.away_name),
    home_logo_url: asText(body.home_logo_url),
    away_logo_url: asText(body.away_logo_url),
    fighter_a: asText(body.fighter_a),
    fighter_b: asText(body.fighter_b),
    fighter_a_photo_url: asText(body.fighter_a_photo_url),
    fighter_b_photo_url: asText(body.fighter_b_photo_url),
    weight_class: asText(body.weight_class),
    total_rounds: asInt(body.total_rounds, 5),
    description: typeof body.description === "string" ? body.description : "",
    chat_enabled: body.chat_enabled !== false,
    host_org_id: hostOrgId,
  };

  let insert = await auth.context.client
    .from("live_events")
    .insert({
      ...baseRow,
      visibility,
      timezone,
      source_type: sourceType,
      source_ready: sourceReady,
      category: asText(body.category) || kind,
      language: asText(body.language) || "en",
    })
    .select()
    .single();

  // Pre-migration DBs may lack readiness columns - retry without them.
  if (
    insert.error &&
    /visibility|timezone|source_type|source_ready|category|language|column .* does not exist/i.test(
      insert.error.message,
    )
  ) {
    insert = await auth.context.client.from("live_events").insert(baseRow).select().single();
  }

  if (insert.error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${insert.error.message}. ${hint}` : insert.error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data: insert.data });
}
