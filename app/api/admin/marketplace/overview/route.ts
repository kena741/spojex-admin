import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/spojex/admin";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

async function localOverview(rangeDays: number) {
  const client = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - (rangeDays - 1));
  const sinceIso = since.toISOString();
  const soon = new Date();
  soon.setDate(soon.getDate() + 14);

  const [services, requests, payments, opps, apps, minis] = await Promise.all([
    client.from("services").select("id, published, provider_id"),
    client.from("service_requests").select("id, status, requested_at, requested_on, completed_at, updated_at"),
    client
      .from("service_payments")
      .select("amount, status, paid_at, created_at")
      .gte("created_at", sinceIso)
      .limit(2000),
    client.from("opportunities").select("id, status, is_published").limit(2000),
    client
      .from("opportunity_applications")
      .select("id, status")
      .in("status", ["submitted", "under_review", "shortlisted"])
      .limit(2000),
    client.from("mini_apps").select("id, published").limit(500),
  ]);

  type Svc = { id: string; published: boolean; provider_id: string };
  type Req = {
    id: string;
    status: string;
    requested_at?: string | null;
    requested_on?: string | null;
    completed_at?: string | null;
    updated_at?: string | null;
  };
  type Pay = { amount?: number | string | null; status?: string | null };
  const svc = (services.data ?? []) as Svc[];
  const reqs = (requests.data ?? []) as Req[];
  const metric = (value: number | null, available = true, note?: string) => ({
    value: available ? value : null,
    available,
    note,
  });

  const pending = reqs.filter((r) =>
    ["pending", "awaiting_payment"].includes(String(r.status).toLowerCase()),
  );
  const upcoming = reqs.filter((r) => {
    if (String(r.status).toLowerCase() !== "accepted") return false;
    const at = r.requested_at
      ? new Date(r.requested_at)
      : r.requested_on
        ? new Date(r.requested_on)
        : null;
    if (!at) return false;
    return at >= new Date() && at <= soon;
  });
  const completed = reqs.filter((r) => {
    if (String(r.status).toLowerCase() !== "completed") return false;
    const t = r.completed_at || r.updated_at;
    return t && t >= sinceIso;
  });
  const closed = reqs.filter((r) => {
    if (!["cancelled", "canceled", "declined"].includes(String(r.status).toLowerCase())) return false;
    return r.updated_at && r.updated_at >= sinceIso;
  });
  const verified = ((payments.data ?? []) as Pay[]).filter((p) =>
    ["completed", "paid", "success", "verified"].includes(String(p.status).toLowerCase()),
  );
  const collections = verified.reduce((s, p) => s + Number(p.amount || 0), 0);
  const providers = new Set(svc.filter((s) => s.published).map((s) => s.provider_id));

  return {
    generated_at: new Date().toISOString(),
    period: { days: rangeDays, label: `Last ${rangeDays} days (period activity)` },
    source: "admin_local_fallback",
    metrics: {
      published_services: metric(svc.filter((s) => s.published).length),
      pending_approvals: metric(svc.filter((s) => !s.published).length),
      active_providers: metric(providers.size),
      pending_bookings: metric(pending.length),
      upcoming_bookings: metric(upcoming.length, true, "Accepted with schedule in next 14 days"),
      completed_bookings_period: metric(completed.length),
      closed_bookings_period: metric(closed.length),
      verified_collections_etb: {
        value: collections.toFixed(2),
        available: !payments.error,
        currency: "ETB",
      },
      platform_commission_etb: { value: null, available: false, currency: "ETB" },
      published_opportunities: metric(
        opps.error
          ? null
          : ((opps.data ?? []) as Array<{ is_published?: boolean }>).filter((o) => o.is_published)
              .length,
        !opps.error,
      ),
      open_opportunities: metric(
        opps.error
          ? null
          : ((opps.data ?? []) as Array<{ status?: string }>).filter(
              (o) => String(o.status).toLowerCase() === "open",
            ).length,
        !opps.error,
      ),
      open_applications: metric(apps.error ? null : (apps.data ?? []).length, !apps.error),
      mini_apps_total: metric(minis.error ? null : (minis.data ?? []).length, !minis.error),
      mini_apps_published: metric(
        minis.error
          ? null
          : ((minis.data ?? []) as Array<{ published?: boolean }>).filter((m) => m.published).length,
        !minis.error,
      ),
    },
    definitions: {
      published_services: "Current published listings (snapshot).",
      pending_approvals: "Unpublished listings (snapshot).",
      verified_collections_etb: `Verified service payments in last ${rangeDays} days.`,
    },
  };
}

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission([
    "services:read",
    "requests:read",
    "opportunities:read",
    "miniapps:read",
    "catalog:read",
  ]);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const rangeDays = Number(url.searchParams.get("range_days") || 30) || 30;

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/marketplace/overview?range_days=${rangeDays}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      if (res.status !== 404) {
        return NextResponse.json(
          { error: (payload as { detail?: string }).detail || "Overview failed" },
          { status: res.status },
        );
      }
    } catch {
      // fallback
    }
  }

  try {
    return NextResponse.json(await localOverview(rangeDays));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Overview failed" },
      { status: 500 },
    );
  }
}
