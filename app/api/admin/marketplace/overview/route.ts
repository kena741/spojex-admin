import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { financeServiceHref, bookingsHref } from "@/lib/marketplace-filters";
import { createAdminClient } from "@/lib/spojex/admin";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

function metric(
  value: number | string | null,
  available = true,
  extra: Record<string, unknown> = {},
) {
  return {
    value: available ? value : null,
    available,
    ...extra,
  };
}

async function localOverview(opts: {
  rangeDays: number;
  start?: string | null;
  end?: string | null;
}) {
  const client = createAdminClient();
  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;
  let startDate: string;
  let endDate: string;
  let days: number;

  if (opts.start && opts.end) {
    startDate = opts.start.slice(0, 10);
    endDate = opts.end.slice(0, 10);
    periodStart = new Date(`${startDate}T00:00:00.000Z`);
    periodEnd = new Date(`${endDate}T23:59:59.999Z`);
    days = Math.max(
      1,
      Math.round((periodEnd.getTime() - periodStart.getTime()) / 864e5) + 1,
    );
  } else {
    days = opts.rangeDays;
    periodEnd = now;
    periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - (days - 1));
    startDate = periodStart.toISOString().slice(0, 10);
    endDate = periodEnd.toISOString().slice(0, 10);
  }

  const sinceIso = periodStart.toISOString();
  const untilIso = periodEnd.toISOString();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 14);

  const [services, requests, payments, opps, apps, minis] = await Promise.all([
    client.from("services").select("id, published, provider_id, created_at, title"),
    client
      .from("service_requests")
      .select(
        "id, status, requested_at, requested_on, completed_at, updated_at, created_at, service_id, requester_id, provider_id",
      ),
    client
      .from("service_payments")
      .select("id, amount, status, paid_at, created_at, currency, commission_amount, request_id, service_id, user_id")
      .limit(5000),
    client.from("opportunities").select("id, status, is_published, application_deadline").limit(2000),
    client
      .from("opportunity_applications")
      .select("id, status, opportunity_id")
      .in("status", ["submitted", "under_review", "shortlisted"])
      .limit(2000),
    client.from("mini_apps").select("id, published, name, url").limit(500),
  ]);

  type Svc = {
    id: string;
    published: boolean;
    provider_id: string;
    created_at?: string;
    title?: string;
  };
  type Req = {
    id: string;
    status: string;
    requested_at?: string | null;
    requested_on?: string | null;
    completed_at?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
    service_id?: string;
    requester_id?: string;
    provider_id?: string;
  };
  type Pay = {
    id?: string;
    amount?: number | string | null;
    status?: string | null;
    paid_at?: string | null;
    created_at?: string | null;
    currency?: string | null;
    commission_amount?: number | string | null;
  };

  const svc = (services.data ?? []) as Svc[];
  const reqs = (requests.data ?? []) as Req[];
  const pays = (payments.data ?? []) as Pay[];

  const inPeriod = (iso?: string | null) =>
    Boolean(iso && iso >= sinceIso && iso <= untilIso);

  const appointmentAt = (r: Req) => {
    if (r.requested_at) return new Date(r.requested_at);
    if (r.requested_on) return new Date(`${r.requested_on}T12:00:00.000Z`);
    return null;
  };

  const pending = reqs.filter((r) =>
    ["pending", "awaiting_payment"].includes(String(r.status).toLowerCase()),
  );
  const upcoming = reqs.filter((r) => {
    if (String(r.status).toLowerCase() !== "accepted") return false;
    const at = appointmentAt(r);
    if (!at) return false;
    return at >= now && at <= soon;
  });
  const unscheduled = reqs.filter(
    (r) =>
      String(r.status).toLowerCase() === "accepted" &&
      !r.requested_at &&
      !r.requested_on,
  );
  const overdue = reqs.filter((r) => {
    if (String(r.status).toLowerCase() !== "accepted") return false;
    const at = appointmentAt(r);
    return Boolean(at && at < now);
  });
  const completed = reqs.filter((r) => {
    if (String(r.status).toLowerCase() !== "completed") return false;
    return inPeriod(r.completed_at || r.updated_at);
  });
  const closed = reqs.filter((r) => {
    if (!["cancelled", "canceled", "declined"].includes(String(r.status).toLowerCase())) {
      return false;
    }
    return inPeriod(r.updated_at);
  });

  const verifiedPays = pays.filter((p) => {
    if (!["completed", "paid", "success", "verified"].includes(String(p.status).toLowerCase())) {
      return false;
    }
    return inPeriod(p.paid_at || p.created_at);
  });
  const refundPays = pays.filter((p) => {
    if (!["refunded", "partial_refund"].includes(String(p.status).toLowerCase())) return false;
    return inPeriod(p.paid_at || p.created_at);
  });
  const failedPays = pays.filter((p) => String(p.status).toLowerCase() === "failed");
  const collections = verifiedPays.reduce((s, p) => s + Number(p.amount || 0), 0);
  const refunds = refundPays.reduce((s, p) => s + Number(p.amount || 0), 0);
  let commission: number | null = null;
  let commissionAvailable = true;
  try {
    commission = verifiedPays.reduce((s, p) => s + Number(p.commission_amount || 0), 0);
  } catch {
    commissionAvailable = false;
  }

  const providers = new Set(svc.filter((s) => s.published).map((s) => s.provider_id));
  const pendingServices = svc.filter((s) => !s.published);
  const openOpps = ((opps.data ?? []) as Array<{ status?: string }>).filter(
    (o) => String(o.status).toLowerCase() === "open",
  );
  const openOppIds = new Set(
    ((opps.data ?? []) as Array<{ id: string; status?: string }>)
      .filter((o) => String(o.status).toLowerCase() === "open")
      .map((o) => o.id),
  );
  const openApps = ((apps.data ?? []) as Array<{ opportunity_id?: string }>).filter((a) =>
    a.opportunity_id ? openOppIds.has(a.opportunity_id) : true,
  );
  const minisRows = (minis.data ?? []) as Array<{
    published?: boolean;
    name?: string;
    url?: string;
  }>;

  const currency = verifiedPays[0]?.currency || "ETB";

  return {
    generated_at: now.toISOString(),
    timezone: "UTC",
    period: {
      days,
      start: sinceIso,
      end: untilIso,
      start_date: startDate,
      end_date: endDate,
      label: `Last ${days} days`,
      range_key: opts.start && opts.end ? "custom" : `${days}d`,
      upcoming_window_days: 14,
    },
    source: "admin_local_fallback",
    sections: {
      services: { available: !services.error },
      bookings: { available: !requests.error },
      finance: { available: !payments.error, commission_available: commissionAvailable },
      opportunities: { available: !opps.error && !apps.error },
      mini_apps: { available: !minis.error },
      trends: { available: false, note: "Trends require Python aggregate endpoint" },
      queues: { available: true },
    },
    metrics: {
      verified_collections_etb: metric(collections.toFixed(2), !payments.error, {
        currency,
        kind: "period",
        href: financeServiceHref({ start: startDate, end: endDate }),
      }),
      completed_bookings_period: metric(completed.length, !requests.error, {
        kind: "period",
        href: bookingsHref({
          status: "completed",
          event: "completed",
          from: startDate,
          to: endDate,
        }),
      }),
      published_services: metric(svc.filter((s) => s.published).length, !services.error, {
        kind: "snapshot",
        href: "/admin/services?published=yes",
      }),
      active_providers: metric(providers.size, !services.error, { kind: "snapshot" }),
      pending_approvals: metric(pendingServices.length, !services.error, {
        kind: "snapshot",
        href: "/admin/services?published=pending",
      }),
      pending_bookings: metric(pending.length, !requests.error, {
        kind: "snapshot",
        href: bookingsHref({ status: ["pending", "awaiting_payment"] }),
      }),
      payment_exceptions: metric(failedPays.length, !payments.error, {
        kind: "snapshot",
        href: "/admin/finance/transactions?module=service&asset=money&status=failed&range=365d",
      }),
      accepted_unscheduled: metric(unscheduled.length, !requests.error, {
        kind: "snapshot",
        href: bookingsHref({ status: "accepted", schedule: "unscheduled" }),
      }),
      overdue_appointments: metric(overdue.length, !requests.error, {
        kind: "snapshot",
        href: bookingsHref({ status: "accepted", schedule: "overdue" }),
      }),
      upcoming_bookings: metric(upcoming.length, !requests.error, {
        kind: "upcoming",
        href: bookingsHref({ status: "accepted", schedule: "upcoming_14d" }),
        note: "Accepted with schedule in next 14 days; excludes unscheduled",
      }),
      closed_bookings_period: metric(closed.length, !requests.error, {
        kind: "period",
        href: bookingsHref({
          status: ["cancelled", "declined"],
          event: "closed",
          from: startDate,
          to: endDate,
        }),
      }),
      refunds_etb: metric(refunds.toFixed(2), !payments.error, {
        currency,
        kind: "period",
        href: financeServiceHref({ start: startDate, end: endDate, status: "refunded" }),
      }),
      platform_commission_etb: metric(
        commissionAvailable && commission != null ? commission.toFixed(2) : null,
        commissionAvailable && !payments.error,
        { currency, kind: "period" },
      ),
      open_opportunities: metric(openOpps.length, !opps.error, {
        href: "/admin/opportunities?status=open",
      }),
      open_applications: metric(openApps.length, !apps.error, {
        href: "/admin/opportunities?status=open&applications=open",
      }),
      mini_apps_published: metric(minisRows.filter((m) => m.published).length, !minis.error, {
        href: "/admin/miniapps?status=published",
      }),
      mini_apps_hidden: metric(minisRows.filter((m) => !m.published).length, !minis.error, {
        href: "/admin/miniapps?status=hidden",
      }),
    },
    queues: {
      pending_approvals: {
        total: pendingServices.length,
        items: pendingServices.slice(0, 8).map((s) => ({
          id: s.id,
          title: s.title,
          created_at: s.created_at,
          href: `/admin/services/${s.id}`,
          action_label: "Review",
        })),
      },
      pending_bookings: {
        total: pending.length,
        items: pending.slice(0, 8).map((r) => ({
          id: r.id,
          status: r.status,
          created_at: r.created_at,
          href: `/admin/requests?id=${r.id}&status=${r.status}`,
          action_label: "Open booking",
        })),
      },
      unscheduled: {
        total: unscheduled.length,
        items: unscheduled.slice(0, 8).map((r) => ({
          id: r.id,
          status: r.status,
          appointment_label: "Not scheduled",
          href: `/admin/requests?id=${r.id}&status=accepted&schedule=unscheduled`,
          action_label: "Open booking",
        })),
      },
      payment_exceptions: {
        total: failedPays.length,
        items: failedPays.slice(0, 8).map((p) => ({
          id: p.id,
          status: p.status,
          amount: p.amount,
          currency: p.currency,
          href: `/admin/finance/transactions?module=service&status=failed`,
          action_label: "Review",
        })),
      },
    },
    trends: { available: false },
    panels: {
      opportunities: {
        available: !opps.error,
        href: "/admin/opportunities?status=open",
      },
      mini_apps: { available: !minis.error, href: "/admin/miniapps" },
    },
    links: {
      services: "/admin/services",
      bookings: "/admin/requests",
      settings: "/admin/marketplace/settings",
      finance_service: financeServiceHref({ start: startDate, end: endDate }),
      opportunities: "/admin/opportunities?status=open",
      miniapps: "/admin/miniapps",
      categories: "/admin/service-categories",
    },
    definitions: {
      upcoming_booking:
        "Accepted with requested_at/on in the next 14 days. Unscheduled excluded.",
      verified_collection: "Verified service_payments in the selected period (paid_at).",
      snapshots_vs_period:
        "Snapshot metrics ignore the historical range. Period metrics use it. Upcoming uses a future window.",
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
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const timezone = url.searchParams.get("timezone") || "Africa/Addis_Ababa";

  const qs = new URLSearchParams();
  if (start && end) {
    qs.set("start", start);
    qs.set("end", end);
  } else {
    qs.set("range_days", String(rangeDays));
  }
  qs.set("timezone", timezone);

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/marketplace/overview?${qs}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      if (res.status !== 404) {
        return NextResponse.json(
          {
            error:
              (payload as { detail?: { message?: string } | string }).detail &&
              typeof (payload as { detail?: unknown }).detail === "object"
                ? ((payload as { detail: { message?: string } }).detail.message ||
                    "Overview failed")
                : (payload as { detail?: string }).detail || "Overview failed",
          },
          { status: res.status },
        );
      }
    } catch {
      // fallback
    }
  }

  try {
    return NextResponse.json(await localOverview({ rangeDays, start, end }));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Overview failed" },
      { status: 500 },
    );
  }
}
