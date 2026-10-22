import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission(["streams:read", "events:read"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/streams/live-events/${id}/workspace`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      if (res.status !== 404) {
        const body = payload as { message?: string; error?: string };
        return NextResponse.json(
          { error: body.message || body.error || "Failed to load workspace" },
          { status: res.status },
        );
      }
    } catch {
      // local
    }
  }

  const { data: event, error } = await auth.context.client
    .from("live_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const url = String(event.stream_url || "").trim();
  const sourceReady = Boolean(event.source_ready) || Boolean(url);
  const status = String(event.status || "").toLowerCase();

  return NextResponse.json({
    event,
    schedule: {
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      timezone: event.timezone || "Africa/Addis_Ababa",
      actual_started_at: event.actual_started_at || null,
      actual_ended_at: event.actual_ended_at || null,
      countdown_seconds: null,
      note: "Countdown reaching zero does not claim the broadcast is live.",
    },
    lifecycle: { status, allowed_transitions: [] },
    source: {
      type: event.source_type || "external_url",
      ready: sourceReady,
      has_external_url: Boolean(url),
      can_go_live: sourceReady && ["scheduled", "suspended", "postponed"].includes(status),
      go_live_blocked_reason: sourceReady
        ? null
        : "Add an external playback URL or mark source ready before going live.",
      ingest_supported: false,
      mock_dev_only: (event.source_type || "") === "mock_dev",
    },
    attribution: {
      managing_organization: { id: event.host_org_id },
      gifts_enabled: Boolean(event.host_org_id || event.host_user_id),
    },
    audience: {
      viewer_count_field: event.viewer_count,
      unique_viewers: null,
      chat_messages: null,
      analytics_note: "Audience metrics unavailable in local fallback.",
      unavailable: true,
    },
    gifts: { gift_count: 0, coins_sent: 0 },
    scoreboard: {
      supported: event.kind === "football" || event.kind === "basketball",
    },
    fightboard: { supported: event.kind === "fight" },
    moderation: { chat_enabled: event.chat_enabled },
    activity: [],
    credentials: {
      stream_keys_concealed: true,
      note: "Ingest keys are never returned in ordinary workspace responses.",
    },
    visibility: event.visibility || "public",
    source_meta: "local",
  });
}
