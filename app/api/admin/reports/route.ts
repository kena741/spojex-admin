import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import type { ReportRow } from "@/lib/types";
import type { SpojexClient } from "@/lib/api/client";

const REPORT_COLUMNS =
  "id, reporter_id, target_user_id, target_service_id, reason, details, created_at";

const REPORT_SELECT = `${REPORT_COLUMNS}, reporter:reporter_id(id, display_name, username, avatar_url), target:target_user_id(id, display_name, username, avatar_url)`;

async function attachServices(client: SpojexClient, rows: ReportRow[]): Promise<ReportRow[]> {
  const serviceIds = [
    ...new Set(rows.map((row) => row.target_service_id).filter((id): id is string => Boolean(id))),
  ];
  if (serviceIds.length === 0) return rows;

  const { data: services } = await client.from("services").select("id, title").in("id", serviceIds);
  if (!services?.length) return rows;

  const byId = new Map(
    (services as { id: string; title: string }[]).map((service) => [service.id, service]),
  );
  return rows.map((row) => ({
    ...row,
    service: row.target_service_id ? (byId.get(row.target_service_id) ?? null) : null,
  }));
}

export async function GET() {
  const auth = await requireAdminPermission("reports:read");
  if (!auth.ok) return auth.error;

  const client = auth.context.client;
  let result = await client
    .from("reports")
    .select(REPORT_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);

  if (result.error) {
    result = await client
      .from("reports")
      .select(REPORT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500);
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  const rows = await attachServices(client, (result.data ?? []) as ReportRow[]);
  return NextResponse.json({ data: rows });
}
