import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("streams:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/streams/radio/${id}/workspace`,
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

  const { data: station, error } = await auth.context.client
    .from("radio_streams")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!station) return NextResponse.json({ error: "Station not found" }, { status: 404 });

  let org: Record<string, unknown> | null = null;
  let ownerName: string | null = null;
  if (station.host_org_id) {
    const { data } = await auth.context.client
      .from("organizations")
      .select("id, name, public_id, user_id, is_platform")
      .eq("id", station.host_org_id)
      .maybeSingle();
    org = data;
    if (data?.user_id) {
      const { data: user } = await auth.context.client
        .from("users")
        .select("display_name")
        .eq("id", data.user_id)
        .maybeSingle();
      ownerName = user?.display_name ?? null;
    }
  }

  const giftsEnabled = Boolean(org?.user_id);

  return NextResponse.json({
    station,
    attribution: {
      managing_organization: org
        ? {
            id: org.id,
            name: org.name,
            public_id: org.public_id,
            is_platform: org.is_platform,
          }
        : null,
      receiving_account_user_id: org?.user_id ?? null,
      receiving_account_name: ownerName,
      gifts_enabled: giftsEnabled,
      gifts_unavailable_reason: giftsEnabled
        ? null
        : "Assign a managing organization with an owner user to enable coin gifts.",
      note: "Each gift stores credited_user_id at send time. Org owner changes do not rewrite history.",
    },
    publication: {
      enabled: station.status === "active",
      status: station.status,
    },
    playback_health: {
      status: station.health_status || "unknown",
      checked_at: station.health_checked_at || null,
      message: station.health_message || "",
      url_valid: Boolean(String(station.stream_url || "").trim()),
    },
    gifts: {},
    moderation: {
      report_count: 0,
      chat_href: `/admin/radio-chat?stream=${id}`,
    },
    activity: [],
    credentials: {
      stream_keys_present: false,
      note: "Ingest credentials are not stored on radio stations.",
    },
    source: "local",
  });
}
