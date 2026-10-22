import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import {
  liveEventKindIds,
  liveEventStatusIds,
  liveStreamKindIds,
} from "@/lib/live-events";

const allowed = [
  "kind",
  "name",
  "slug",
  "thumbnail_url",
  "stream_url",
  "stream_kind",
  "replay_url",
  "starts_at",
  "ends_at",
  "status",
  "location",
  "organizer",
  "competition",
  "stadium",
  "home_name",
  "away_name",
  "home_logo_url",
  "away_logo_url",
  "home_score",
  "away_score",
  "match_minute",
  "match_period",
  "status_line",
  "fighter_a",
  "fighter_b",
  "fighter_a_photo_url",
  "fighter_b_photo_url",
  "weight_class",
  "current_round",
  "total_rounds",
  "round_seconds_left",
  "fight_result",
  "description",
  "chat_enabled",
  "viewer_count",
  "sort_order",
  "host_user_id",
  "host_org_id",
  "default_duration_minutes",
  "round_ends_at",
  "visibility",
  "timezone",
  "source_type",
  "source_ready",
  "actual_started_at",
  "actual_ended_at",
] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermission(["events:write", "streams:write"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }
  if (typeof patch.kind === "string" && !liveEventKindIds.has(patch.kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (typeof patch.status === "string" && !liveEventStatusIds.has(patch.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (typeof patch.stream_kind === "string" && !liveStreamKindIds.has(patch.stream_kind)) {
    return NextResponse.json({ error: "Invalid stream kind" }, { status: 400 });
  }
  if (patch.status === "live" && !("ends_at" in patch)) {
    patch.ends_at = null;
  }
  if (patch.status === "finished" && !("ends_at" in patch)) {
    patch.ends_at = new Date().toISOString();
  }
  if ("chat_enabled" in patch) {
    patch.chat_enabled = patch.chat_enabled !== false;
  }

  const { data, error } = await auth.context.client
    .from("live_events")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  if (!data) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermission(["events:write", "streams:write"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const { error } = await auth.context.client.from("live_events").delete().eq("id", id);
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
