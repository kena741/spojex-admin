import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/spojex/admin";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

const ALLOWED: Record<string, string[]> = {
  pending: ["accepted", "declined", "cancelled"],
  awaiting_payment: ["accepted", "cancelled", "declined"],
  accepted: ["completed", "cancelled"],
  declined: [],
  completed: [],
  cancelled: [],
  canceled: [],
};

function appointmentLabel(requestedAt: string | null, requestedOn: string | null) {
  if (requestedAt) return requestedAt;
  if (requestedOn) return `${requestedOn} (date only)`;
  return "Not scheduled";
}

function paymentLabel(status: string | null, pricingType: string | null) {
  const pt = (pricingType || "").toLowerCase();
  if (pt === "free" || pt === "custom_quote") return status || "Not required";
  if (!status) return "No payment record";
  const s = status.toLowerCase();
  if (["completed", "paid", "success", "verified"].includes(s)) return "Verified";
  if (["pending", "processing"].includes(s)) return "Awaiting payment";
  if (s === "failed") return "Failed";
  if (s === "refunded") return "Refunded";
  return status;
}

function matchesSchedule(
  row: {
    status?: string;
    requested_at?: string | null;
    requested_on?: string | null;
  },
  schedule?: string | null,
) {
  if (!schedule) return true;
  const status = String(row.status || "").toLowerCase();
  if (status !== "accepted") return false;
  const now = Date.now();
  const soon = now + 14 * 864e5;
  const at = row.requested_at
    ? new Date(row.requested_at).getTime()
    : row.requested_on
      ? new Date(`${row.requested_on}T12:00:00.000Z`).getTime()
      : null;
  if (schedule === "unscheduled") return at == null;
  if (schedule === "upcoming_14d") return at != null && at >= now && at <= soon;
  if (schedule === "overdue") return at != null && at < now;
  return true;
}

async function localBookings(params: {
  status?: string | null;
  schedule?: string | null;
  event?: string | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
  page: number;
  page_size: number;
}) {
  const client = createAdminClient();
  let query = client
    .from("service_requests")
    .select(
      "id, service_id, requester_id, provider_id, message, location, requested_on, requested_at, status, created_at, updated_at, completed_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (params.status && params.status !== "all") {
    const statuses = params.status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      query = query.eq("status", statuses[0]);
    } else if (statuses.length > 1) {
      const expanded = statuses.flatMap((s) =>
        s === "cancelled" ? ["cancelled", "canceled"] : [s],
      );
      query = query.in("status", expanded);
    }
  }

  const from = (params.page - 1) * params.page_size;
  const to = from + params.page_size - 1;
  const { data: rows, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);

  const list = (rows ?? []) as Array<Record<string, unknown>>;
  const userIds = [
    ...new Set(
      list.flatMap((r) => [r.requester_id, r.provider_id]).filter(Boolean).map(String),
    ),
  ];
  const serviceIds = [...new Set(list.map((r) => String(r.service_id)).filter(Boolean))];
  const requestIds = list.map((r) => String(r.id));

  const [usersRes, servicesRes, paymentsRes] = await Promise.all([
    userIds.length
      ? client.from("users").select("id, display_name, email, role, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    serviceIds.length
      ? client
          .from("services")
          .select("id, title, pricing_type, price_amount, currency")
          .in("id", serviceIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    requestIds.length
      ? client
          .from("service_payments")
          .select("id, request_id, status, amount, currency, provider_ref, paid_at, created_at")
          .in("request_id", requestIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const users = Object.fromEntries(
    ((usersRes.data ?? []) as Array<Record<string, unknown>>).map((u) => [String(u.id), u]),
  );
  const services = Object.fromEntries(
    ((servicesRes.data ?? []) as Array<Record<string, unknown>>).map((s) => [String(s.id), s]),
  );
  const paymentsByRequest: Record<string, Record<string, unknown>[]> = {};
  for (const p of (paymentsRes.data ?? []) as Array<Record<string, unknown>>) {
    const key = String(p.request_id);
    (paymentsByRequest[key] ??= []).push(p);
  }

  let data = list.map((r) => {
    const svc = services[String(r.service_id)] as Record<string, unknown> | undefined;
    const pays = paymentsByRequest[String(r.id)] ?? [];
    pays.sort((a, b) => {
      const rank = (s: unknown) =>
        ["completed", "paid", "success", "verified"].includes(String(s).toLowerCase()) ? 0 : 1;
      return rank(a.status) - rank(b.status);
    });
    const pay = pays[0];
    const pricingType = svc ? String(svc.pricing_type || "") : null;
    return {
      id: r.id,
      service_id: r.service_id,
      service: svc
        ? {
            id: svc.id,
            title: svc.title,
            pricing_type: svc.pricing_type,
            price_amount: svc.price_amount,
            currency: svc.currency || "ETB",
          }
        : { id: r.service_id, title: null },
      requester: users[String(r.requester_id)] ?? { id: r.requester_id, display_name: null },
      provider: users[String(r.provider_id)] ?? { id: r.provider_id, display_name: null },
      message: r.message,
      location: r.location,
      requested_on: r.requested_on,
      requested_at: r.requested_at,
      appointment_label: appointmentLabel(
        r.requested_at ? String(r.requested_at) : null,
        r.requested_on ? String(r.requested_on) : null,
      ),
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      completed_at: r.completed_at,
      payment: pay
        ? {
            id: pay.id,
            status: pay.status,
            amount: pay.amount,
            currency: pay.currency || "ETB",
            provider_ref: pay.provider_ref,
            paid_at: pay.paid_at,
            label: paymentLabel(String(pay.status), pricingType),
          }
        : {
            id: null,
            status: null,
            label: paymentLabel(null, pricingType),
          },
      allowed_transitions: ALLOWED[String(r.status).toLowerCase()] ?? [],
      finance_tx_id: pay?.id ? `service_payment:${pay.id}` : null,
    };
  });

  if (params.schedule) {
    data = data.filter((row) =>
      matchesSchedule(
        row as {
          status?: string;
          requested_at?: string | null;
          requested_on?: string | null;
        },
        params.schedule,
      ),
    );
  }

  if (params.from && params.to) {
    const fromIso = `${params.from.slice(0, 10)}T00:00:00.000Z`;
    const toIso = `${params.to.slice(0, 10)}T23:59:59.999Z`;
    const event = params.event || "created";
    data = data.filter((row) => {
      const r = row as {
        created_at?: string | null;
        completed_at?: string | null;
        updated_at?: string | null;
      };
      const ts =
        event === "completed"
          ? r.completed_at || r.updated_at
          : event === "closed"
            ? r.updated_at
            : r.created_at;
      return Boolean(ts && ts >= fromIso && ts <= toIso);
    });
  }

  if (params.q?.trim()) {
    const q = params.q.trim().toLowerCase();
    data = data.filter((row) =>
      [
        row.message,
        row.location,
        (row.service as { title?: string } | null)?.title,
        (row.requester as { display_name?: string })?.display_name,
        (row.provider as { display_name?: string })?.display_name,
        row.id,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }

  const filteredTotal =
    params.schedule || params.from || params.q ? data.length : (count ?? data.length);

  return {
    data,
    total: filteredTotal,
    page: params.page,
    page_size: params.page_size,
    source: "admin_local_fallback",
    filters: {
      status: params.status,
      schedule: params.schedule,
      event: params.event,
      from: params.from,
      to: params.to,
    },
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminPermission("requests:read");
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const schedule = url.searchParams.get("schedule");
  const event = url.searchParams.get("event");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q");
  const page = Number(url.searchParams.get("page") || 1) || 1;
  const page_size = Number(url.searchParams.get("page_size") || 40) || 40;

  const token = await requestAccessToken();
  if (token) {
    try {
      const target = `${getSpojexApiBaseUrl()}/api/v1/admin/marketplace/bookings?${url.searchParams}`;
      const res = await fetch(target, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...(payload as object), source: "python" });
      if (res.status !== 404) {
        return NextResponse.json(
          { error: (payload as { detail?: string; error?: string }).detail || (payload as { error?: string }).error || "Failed" },
          { status: res.status },
        );
      }
    } catch {
      // fallback
    }
  }

  try {
    return NextResponse.json(
      await localBookings({ status, schedule, event, from, to, q, page, page_size }),
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load bookings" },
      { status: 500 },
    );
  }
}
