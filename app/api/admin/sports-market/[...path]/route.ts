import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { smPermissionFor } from "@/lib/sports-market";
import { proxySportsMarket } from "@/lib/sports-market-server";

type Ctx = { params: Promise<{ path: string[] }> };

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

async function handle(request: Request, { params }: Ctx, method: string) {
  const { path } = await params;
  if (!path.length || !path.every((p) => SAFE_SEGMENT.test(p))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const joined = path.join("/");
  const auth = await requireAnyAdminPermission(smPermissionFor(method, joined));
  if (!auth.ok) return auth.error;
  const search = new URL(request.url).search;
  let body: unknown;
  if (method !== "GET" && method !== "DELETE") {
    body = await request.json().catch(() => ({}));
  }
  return proxySportsMarket(joined, method, search, body);
}

/** Sports Marketplace admin API — proxied to /api/v1/admin/sports-market/* (backend validates + audits). */
export function GET(request: Request, ctx: Ctx) {
  return handle(request, ctx, "GET");
}

export function POST(request: Request, ctx: Ctx) {
  return handle(request, ctx, "POST");
}

export function PATCH(request: Request, ctx: Ctx) {
  return handle(request, ctx, "PATCH");
}
