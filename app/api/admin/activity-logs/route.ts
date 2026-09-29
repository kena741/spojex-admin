import { NextResponse } from "next/server";
import { requireAdminPermission, requireAdminSession } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { enrichActivityLogs } from "@/lib/activity-log-enrichment";
import type { AdminActivityLog, CreateActivityLogPayload } from "@/lib/activity-log";

type ActivityLogRow = {
  id: string;
  created_at: string;
  admin_id: string | null;
  admin_email: string | null;
  admin_name: string | null;
  admin_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  route: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  env: string;
};

export async function GET(request: Request) {
  const auth = await requireAdminPermission("logs:read");
  if (!auth.ok) return auth.error;

  const client = auth.context.client;
  try {
    const { searchParams } = new URL(request.url);
    const adminId = (searchParams.get("admin_id") || "").trim();
    const action = (searchParams.get("action") || "").trim();
    const resourceType = (searchParams.get("resource_type") || "").trim();
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 200);
    const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

    let query = client
      .from("admin_activity_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (adminId) query = query.eq("admin_id", adminId);
    if (action) query = query.eq("action", action);
    if (resourceType) query = query.eq("resource_type", resourceType);

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data as ActivityLogRow[]) ?? []).map((row) => ({
      ...row,
      metadata: row.metadata ?? {},
    })) as AdminActivityLog[];

    const enriched = await enrichActivityLogs(client, rows);

    return NextResponse.json({
      data: enriched,
      total: count ?? enriched.length,
      limit,
      offset,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.error;

  try {
    const body = (await request.json()) as CreateActivityLogPayload;
    const action = (body.action || "").trim();
    const resourceType = (body.resource_type || "").trim();
    const summary = (body.summary || "").trim();

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }
    if (!resourceType) {
      return NextResponse.json({ error: "resource_type is required" }, { status: 400 });
    }
    if (!summary) {
      return NextResponse.json({ error: "summary is required" }, { status: 400 });
    }

    await logAdminActivity({
      context: auth.context,
      request,
      action,
      resource_type: resourceType,
      resource_id: body.resource_id,
      summary,
      metadata: body.metadata,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
