import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { isAppPlatform } from "@/lib/app-updates";
import { proxyAppUpdates } from "@/lib/app-updates-server";

const FIELDS = [
  "target_version",
  "target_build",
  "update_type",
  "title",
  "description",
  "notify_enabled",
  "notify_frequency_hours",
  "staged_rollout",
  "store_url",
  "store_country",
] as const;

/** Save one platform's update prompt; the backend validates and audits. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const auth = await requireAdminPermission("settings:write");
  if (!auth.ok) return auth.error;
  const { platform } = await params;
  if (!isAppPlatform(platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of FIELDS) {
    if (key in body) patch[key] = body[key];
  }
  return proxyAppUpdates(`/${platform}`, "PATCH", patch);
}
