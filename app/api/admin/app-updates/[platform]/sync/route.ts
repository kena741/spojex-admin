import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { isAppPlatform, proxyAppUpdates } from "@/lib/app-updates";

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
