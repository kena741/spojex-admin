import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminPermission("streams:read");
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(`${getSpojexApiBaseUrl()}/api/v1/admin/streams/overview`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
    } catch {
      // local fallback
    }
  }

  const { count: enabled } = await auth.context.client
    .from("radio_streams")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  const { count: radioTotal } = await auth.context.client
    .from("radio_streams")
    .select("id", { count: "exact", head: true });
  const { count: scheduled } = await auth.context.client
    .from("live_events")
    .select("id", { count: "exact", head: true })
    .eq("status", "scheduled");
  const { count: live } = await auth.context.client
    .from("live_events")
    .select("id", { count: "exact", head: true })
    .eq("status", "live");

  return NextResponse.json({
    radio: {
      enabled_stations: enabled ?? 0,
      total_stations: radioTotal ?? 0,
      health_failures: 0,
      reachable: 0,
      health_unknown: radioTotal ?? 0,
      definitions: {
        enabled: "Publication status = active (on air listing). Not playback health.",
        health_failures: "Last probe reported unreachable or invalid URL.",
        reachable: "Last probe reached the endpoint. Not proof of continuous playability.",
      },
    },
    live_events: {
      scheduled_broadcasts: scheduled ?? 0,
      confirmed_live_sessions: live ?? 0,
      live_source_gaps: 0,
      definitions: {
        scheduled: "status=scheduled - countdown may reach zero without going live.",
        confirmed_live: "status=live - requires explicit go-live, not countdown alone.",
        live_source_gaps: "Marked live but missing ready source / stream URL.",
      },
    },
    config_vs_health: "Configuration/enabled status is separate from playback health.",
    source: "local",
  });
}
