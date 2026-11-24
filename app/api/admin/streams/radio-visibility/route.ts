import { NextResponse } from "next/server";
import { requireAdminPermission, requireAnyAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";

export const dynamic = "force-dynamic";

const ROW_ID = "streams";

function shape(data: unknown): { radio_enabled: boolean } {
  const obj =
    data && typeof data === "object"
      ? (data as { radio_enabled?: unknown })
      : {};
  // Missing key defaults to on — matches public app-info.
  return {
    radio_enabled:
      obj.radio_enabled !== false &&
      obj.radio_enabled !== "false" &&
      obj.radio_enabled !== 0 &&
      obj.radio_enabled !== "0",
  };
}

/** Show/hide Live Radio in the Spojex Stream hub (`app_settings/streams`). */
export async function GET() {
  const auth = await requireAnyAdminPermission([
    "streams:read",
    "streams:write",
    "settings:read",
    "settings:write",
  ]);
  if (!auth.ok) return auth.error;
  const { data, error } = await auth.context.client
    .from("app_settings")
    .select("id, data")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(shape(data?.data));
}

export async function PUT(request: Request) {
  const auth = await requireAnyAdminPermission(["streams:write", "settings:write"]);
  if (!auth.ok) return auth.error;
  const body = (await request.json().catch(() => ({}))) as {
    radio_enabled?: unknown;
  };
  const next = {
    radio_enabled: body.radio_enabled !== false && body.radio_enabled !== "false",
  };
  const client = auth.context.client;
  const { data: existing } = await client
    .from("app_settings")
    .select("id, data")
    .eq("id", ROW_ID)
    .maybeSingle();
  const previous =
    existing?.data && typeof existing.data === "object"
      ? (existing.data as Record<string, unknown>)
      : {};
  const data = { ...previous, ...next };
  const row = { data, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await client.from("app_settings").update(row).eq("id", ROW_ID)
    : await client.from("app_settings").insert({ id: ROW_ID, ...row });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminActivity({
    context: auth.context,
    request,
    action: "update",
    resource_type: "settings",
    resource_id: ROW_ID,
    summary: next.radio_enabled
      ? "Live Radio turned on in the app"
      : "Live Radio turned off in the app",
  });
  return NextResponse.json(next);
}
