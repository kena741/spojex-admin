import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminPermission("streams:read");
  if (!auth.ok) return auth.error;

  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of [
    "q",
    "status",
    "genre",
    "organization",
    "health",
    "featured",
    "page",
    "page_size",
    "sort",
    "order",
  ]) {
    const value = incoming.searchParams.get(key);
    if (value) params.set(key, value);
  }

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/streams/radio?${params}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
    } catch {
      // fall through
    }
  }

  const page = Math.max(1, Number(params.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("page_size") || 40) || 40));
  const q = (params.get("q") || "").trim().toLowerCase();
  const status = (params.get("status") || "all").toLowerCase();
  const genre = (params.get("genre") || "all").toLowerCase();
  const org = (params.get("organization") || "").trim();
  const featured = (params.get("featured") || "all").toLowerCase();

  const { data, error } = await auth.context.client
    .from("radio_streams")
    .select("*")
    .order("sort_order")
    .order("name")
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let rows = (data ?? []) as Record<string, unknown>[];
  rows = rows.filter((row) => {
    if (status !== "all" && String(row.status || "").toLowerCase() !== status) return false;
    if (genre !== "all" && String(row.genre || "").toLowerCase() !== genre) return false;
    if (org && String(row.host_org_id || "") !== org) return false;
    if (featured === "yes" && !row.is_featured) return false;
    if (featured === "no" && row.is_featured) return false;
    if (q) {
      const hay = [row.name, row.tagline, row.city, row.genre].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize).map((row) => ({
    ...row,
    publication: {
      status: row.status,
      enabled: String(row.status || "").toLowerCase() === "active",
      note: "Enabled means listed on air - not confirmed healthy playback.",
    },
    playback_health: {
      status: row.health_status || "unknown",
      checked_at: row.health_checked_at || null,
      message: row.health_message || "",
    },
    href: `/admin/streams/${row.id}`,
    chat_href: `/admin/radio-chat?stream=${row.id}`,
  }));

  return NextResponse.json({
    data: pageRows,
    total,
    page,
    page_size: pageSize,
    source: "local",
  });
}
