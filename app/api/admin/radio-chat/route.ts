import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyRadioChat } from "@/lib/radio-chat-api";

export const dynamic = "force-dynamic";

/** Workspace summary (stations / messages / unresolved reports). */
export async function GET() {
  const auth = await requireAnyAdminPermission([
    "streams:read",
    "reports:read",
    "messages:read",
  ]);
  if (!auth.ok) return auth.error;
  return proxyRadioChat("/summary");
}
