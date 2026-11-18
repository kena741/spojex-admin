import { NextResponse } from "next/server";
import { requireAdminPermission, requireAnyAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { cleanKeys, fullOrder } from "@/lib/native-apps-visibility";

export const dynamic = "force-dynamic";

const ROW_ID = "native_apps";

function shape(data: unknown) {
  const obj = data && typeof data === "object" ? (data as { hidden?: unknown; order?: unknown }) : {};
  return { hidden: cleanKeys(obj.hidden), order: fullOrder(obj.order) };
}

/** Order and visibility of native apps in the Spojex app (`app_settings/native_apps`). */
export async function GET() {
  const auth = await requireAnyAdminPermission([
    "settings:read",
    "settings:write",
    "stadiums:read",
    "gyms:read",
    "events:read",
    "donations:read",
    "streams:read",
    "awards:read",
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
  const auth = await requireAdminPermission("settings:write");
  if (!auth.ok) return auth.error;
  const next = shape(await request.json().catch(() => ({})));
  const client = auth.context.client;
  const row = { data: next, updated_at: new Date().toISOString() };
  const { data: existing } = await client.from("app_settings").select("id").eq("id", ROW_ID).maybeSingle();
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
    summary: `Native apps order: ${next.order.join(", ")}${next.hidden.length ? ` · hidden: ${next.hidden.join(", ")}` : ""}`,
  });
  return NextResponse.json(next);
}
