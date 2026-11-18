import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { isAppPlatform } from "@/lib/app-updates";
import { proxyAppUpdates } from "@/lib/app-updates-server";

/** Re-read the live version from Google Play / the App Store now. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const auth = await requireAnyAdminPermission(["settings:read", "settings:write"]);
  if (!auth.ok) return auth.error;
  const { platform } = await params;
  if (!isAppPlatform(platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  }
  return proxyAppUpdates(`/${platform}/sync`, "POST");
}
