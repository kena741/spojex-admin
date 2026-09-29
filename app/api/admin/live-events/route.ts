import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import {
  asInt,
  asText,
  defaultStreamKind,
  liveEventKindIds,
  liveEventStatusIds,
  liveStreamKindIds,
  slugifyLiveEvent,
} from "@/lib/live-events";

export async function GET() {
  const auth = await requireAnyAdminPermission(["events:read", "streams:read"]);
  if (!auth.ok) return auth.error;
  const { data, error } = await auth.context.client
    .from("live_events")
    .select("*")
    .order("starts_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
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

  const organizer =
    asText(body.organizer) || (hostOrgId ? "Spojex" : "");

  const { data, error } = await auth.context.client
    .from("live_events")
    .insert({
      name,
      kind,
      slug: `${slugBase}-${Date.now().toString(36).slice(-6)}`,
      starts_at: startsAt,
      ends_at: asText(body.ends_at) || null,
      status: status && liveEventStatusIds.has(status) ? status : "scheduled",
      thumbnail_url: asText(body.thumbnail_url),
      stream_url: asText(body.stream_url),
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
    })
    .select()
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
