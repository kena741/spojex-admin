import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ section: string }> };

const ALLOWED = new Set([
  "overview",
  "users",
  "gyms",
  "content",
  "export",
]);

function backendError(payload: Record<string, unknown>, fallback: string) {
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const nested = detail as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message;
    }
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  return fallback;
}

async function proxyAnalytics(path: string, search: string) {
  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const base = getSpojexApiBaseUrl();
  const url = `${base}/api/v1/admin/analytics/${path}${search ? `?${search}` : ""}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/csv")) {
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: text || "Export failed" }, { status: res.status });
    }
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          res.headers.get("Content-Disposition") ||
          `attachment; filename="spojex-analytics.csv"`,
      },
    });
  }

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return NextResponse.json(
      { error: backendError(payload, "Analytics request failed") },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}

/** Authenticated proxy to Spojex admin analytics. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.error;

  const { section } = await ctx.params;
  if (!ALLOWED.has(section)) {
    return NextResponse.json({ error: "Unknown analytics section" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  // export uses ?section=users|gyms|content via nested path style:
  // /api/admin/analytics/export?export_section=gyms OR path /export/gyms
  const exportSection = searchParams.get("export_section");
  searchParams.delete("export_section");
  const qs = searchParams.toString();

  if (section === "export") {
    if (!exportSection || !["users", "gyms", "content"].includes(exportSection)) {
      return NextResponse.json(
        { error: "export_section must be users, gyms, or content" },
        { status: 400 },
      );
    }
    return proxyAnalytics(`export/${exportSection}`, qs);
  }

  return proxyAnalytics(section, qs);
}
