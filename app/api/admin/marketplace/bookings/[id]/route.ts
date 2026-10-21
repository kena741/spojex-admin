import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

const ALLOWED: Record<string, string[]> = {
  pending: ["accepted", "declined", "cancelled"],
  awaiting_payment: ["accepted", "cancelled", "declined"],
  accepted: ["completed", "cancelled"],
  declined: [],
  completed: [],
  cancelled: [],
  canceled: [],
};

type Ctx = { params: Promise<{ id: string }> };

async function proxyPython(path: string, init?: RequestInit) {
  const token = await requestAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${getSpojexApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    const payload = await res.json().catch(() => ({}));
    return { res, payload };
  } catch {
    return null;
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireAdminPermission("requests:read");
  if (!auth.ok) return auth.error;
  const { id } = await ctx.params;

  const proxied = await proxyPython(`/api/v1/admin/marketplace/bookings/${id}`);
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }
  if (proxied?.res.status === 404) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const { data, error } = await auth.context.client
    .from("service_requests")
    .select(
      "*, services:service_id(id, title, cover_url, pricing_type, price_amount, currency, availability_mode), requester:requester_id(id, display_name, email, role, avatar_url), provider:provider_id(id, display_name, email, role, avatar_url), service_payments(id, status, amount, currency, provider_ref, paid_at, created_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const svc = data.services as Record<string, unknown> | null;
  const pays = Array.isArray(data.service_payments) ? data.service_payments : [];
  const pay = pays[0] as Record<string, unknown> | undefined;

  return NextResponse.json({
    data: {
      id: data.id,
      reference: `BK-${String(data.id).slice(0, 8).toUpperCase()}`,
      service_id: data.service_id,
      service: svc
        ? {
            id: svc.id,
            title: svc.title,
            cover_url: svc.cover_url,
            pricing_type: svc.pricing_type,
            price_amount: svc.price_amount,
            currency: svc.currency,
          }
        : null,
      requester: data.requester,
      provider: data.provider,
      message: data.message,
      location: data.location,
      requested_at: data.requested_at,
      requested_on: data.requested_on,
      appointment_label:
        data.requested_at ||
        (data.requested_on ? `${data.requested_on} (date only)` : "Not scheduled"),
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at,
      completed_at: data.completed_at,
      payment: pay
        ? {
            id: pay.id,
            status: pay.status,
            amount: pay.amount,
            currency: pay.currency,
            provider_ref: pay.provider_ref,
            paid_at: pay.paid_at,
          }
        : null,
      allowed_transitions: ALLOWED[String(data.status).toLowerCase()] ?? [],
      href: `/admin/requests/${data.id}`,
    },
    payment_attempts: pays,
    similar_bookings: [],
    timeline: [],
    source: "admin_local_fallback",
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdminPermission("requests:write");
  if (!auth.ok) return auth.error;
  const { id } = await ctx.params;
  const body = (await request.json()) as {
    status?: string;
    reason?: string;
    expected_updated_at?: string;
    force_complete?: boolean;
    action?: string;
    requested_at?: string | null;
    clear?: boolean;
    check_conflicts?: boolean;
  };

  // Schedule update via same route when action=schedule (or dedicated path)
  if (body.action === "schedule" || ("requested_at" in body && !body.status) || body.clear) {
    const proxied = await proxyPython(`/api/v1/admin/marketplace/bookings/${id}/schedule`, {
      method: "PATCH",
      body: JSON.stringify({
        requested_at: body.requested_at,
        clear: body.clear === true,
        reason: body.reason,
        expected_updated_at: body.expected_updated_at,
        check_conflicts: body.check_conflicts !== false,
      }),
    });
    if (proxied?.res.ok) return NextResponse.json(proxied.payload);
    if (proxied && proxied.res.status !== 404) {
      return NextResponse.json(
        {
          error:
            (proxied.payload as { error?: string; message?: string }).error ||
            (proxied.payload as { message?: string }).message ||
            "Schedule update failed",
        },
        { status: proxied.res.status },
      );
    }
    // Local schedule fallback
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.clear) {
      patch.requested_at = null;
      patch.requested_on = null;
    } else if (body.requested_at) {
      patch.requested_at = body.requested_at;
      patch.requested_on = body.requested_at.slice(0, 10);
    }
    const { data, error } = await auth.context.client
      .from("service_requests")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, data, source: "admin_local_fallback" });
  }

  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const proxied = await proxyPython(`/api/v1/admin/marketplace/bookings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (proxied?.res.ok) return NextResponse.json(proxied.payload);
  if (proxied && proxied.res.status !== 404) {
    const detail =
      typeof (proxied.payload as { detail?: unknown }).detail === "string"
        ? (proxied.payload as { detail: string }).detail
        : (proxied.payload as { error?: string; message?: string }).error ||
          (proxied.payload as { message?: string }).message ||
          "Update failed";
    return NextResponse.json({ error: detail }, { status: proxied.res.status });
  }

  const { data: current, error: loadError } = await auth.context.client
    .from("service_requests")
    .select("id, status, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const allowed = ALLOWED[String(current.status).toLowerCase()] ?? [];
  if (!allowed.includes(body.status)) {
    return NextResponse.json(
      { error: `Cannot transition from ${current.status} to ${body.status}` },
      { status: 400 },
    );
  }
  if (["declined", "cancelled", "canceled"].includes(body.status) && !body.reason?.trim()) {
    return NextResponse.json({ error: "A reason is required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    status: body.status,
    updated_at: new Date().toISOString(),
  };
  if (body.status === "completed") {
    patch.completed_at = new Date().toISOString();
  }

  const { data, error } = await auth.context.client
    .from("service_requests")
    .update(patch)
    .eq("id", id)
    .eq("status", current.status)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) {
    return NextResponse.json(
      { error: "Booking was updated by someone else. Refresh and try again." },
      { status: 409 },
    );
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "update",
    resource_type: "service_request",
    resource_id: id,
    summary: `Booking ${current.status} → ${body.status}`,
    metadata: {
      from: current.status,
      to: body.status,
      reason: body.reason ?? null,
      payment_unchanged: true,
    },
  });

  return NextResponse.json({
    ok: true,
    data,
    allowed_transitions: ALLOWED[body.status] ?? [],
    source: "admin_local_fallback",
  });
}
