import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import {
  bookingEmbedFallback,
  bookingEmbedSelect,
  firstPayment,
  isMissingRelation,
} from "@/lib/marketplace";
import { bookingPaymentLabel } from "@/lib/service-pricing";
import { withServiceMediaUrls } from "@/lib/services-media";
import { requestAccessToken } from "@/lib/spojex/server";

const allowed = [
  "title",
  "description",
  "category_id",
  "subcategory_id",
  "city",
  "country",
  "pricing_type",
  "price_amount",
  "currency",
  "availability_mode",
  "duration_minutes",
  "service_area",
  "is_featured",
  "cover_url",
  "images",
] as const;

const listingSelect =
  "*, users:provider_id(id, display_name, verified, avatar_url, role, email), category:category_id(id, label, emoji), subcategory:subcategory_id(id, label, emoji)";

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

function enrichBooking(
  row: Record<string, unknown>,
  pricingType: string | null | undefined,
) {
  const payment = firstPayment(
    row.service_payments as
      | { id: string; status: string; amount: number; currency: string }[]
      | { id: string; status: string; amount: number; currency: string }
      | null
      | undefined,
  );
  const paymentStatus =
    (row.payment_status as string | undefined) || payment?.status || null;
  const paymentAmount =
    row.payment_amount != null ? Number(row.payment_amount) : payment?.amount;
  const paymentCurrency =
    (row.payment_currency as string | undefined) || payment?.currency;
  const paymentId = (row.payment_id as string | undefined) || payment?.id;
  const requestedAt = row.requested_at as string | null | undefined;
  const requestedOn = row.requested_on as string | null | undefined;
  const appointmentLabel = requestedAt
    ? String(requestedAt)
    : requestedOn
      ? `${requestedOn} (date only)`
      : "Not scheduled";
  const requester = row.requester as
    | { id?: string; display_name?: string; avatar_url?: string }
    | null
    | undefined;

  return {
    ...row,
    reference: `BK-${String(row.id || "").slice(0, 8).toUpperCase()}`,
    appointment_label: row.appointment_label || appointmentLabel,
    payment_label:
      (row.payment_label as string | undefined) ||
      bookingPaymentLabel(paymentStatus, pricingType),
    payment_status: paymentStatus,
    payment_amount: paymentAmount,
    payment_currency: paymentCurrency,
    people_href: row.requester_id
      ? `/admin/people/${row.requester_id}`
      : requester?.id
        ? `/admin/people/${requester.id}`
        : null,
    booking_href: `/admin/requests?q=${row.id}`,
    finance_href: paymentId
      ? `/admin/finance/transactions?module=service&id=service_payment:${paymentId}`
      : null,
    finance_tx_id: paymentId ? `service_payment:${paymentId}` : null,
    requester: requester || {
      id: row.requester_id,
      display_name: row.customer_name,
      avatar_url: row.customer_avatar,
    },
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("services:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const proxied = await proxyPython(`/api/v1/admin/services/${id}`);
  if (proxied?.res.ok) {
    const payload = proxied.payload as {
      data?: Record<string, unknown>;
      bookings?: Array<Record<string, unknown>>;
    };
    return NextResponse.json({
      ...payload,
      data: payload.data ? withServiceMediaUrls(payload.data) : payload.data,
      bookings: (payload.bookings ?? []).map((b) =>
        enrichBooking(b, payload.data?.pricing_type as string | undefined),
      ),
      source: "python",
    });
  }
  if (proxied?.res.status === 404) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const [service, categories, subcategories, bookingsRich] = await Promise.all([
    auth.context.client.from("services").select(listingSelect).eq("id", id).maybeSingle(),
    auth.context.client.from("service_categories").select("*").order("sort_order"),
    auth.context.client.from("service_subcategories").select("*").order("sort_order"),
    auth.context.client
      .from("service_requests")
      .select(bookingEmbedSelect)
      .eq("service_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  let bookings: Record<string, unknown>[] = (bookingsRich.data ?? []) as Record<
    string,
    unknown
  >[];
  if (bookingsRich.error) {
    if (isMissingRelation(bookingsRich.error.message)) {
      const fallbackBookings = await auth.context.client
        .from("service_requests")
        .select(bookingEmbedFallback)
        .eq("service_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      bookings = (fallbackBookings.data ?? []) as Record<string, unknown>[];
    } else {
      bookings = [];
    }
  }

  let data = service.data as Record<string, unknown> | null;
  if (service.error) {
    const fallback = await auth.context.client
      .from("services")
      .select("*, users:provider_id(id, display_name, verified, avatar_url, role)")
      .eq("id", id)
      .maybeSingle();
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 400 });
    }
    data = fallback.data as Record<string, unknown> | null;
  }

  if (!data) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const enriched = withServiceMediaUrls({
    ...data,
    publication_label: data.published ? "Published" : "Pending review",
    publication_state: data.published ? "published" : "pending_review",
    people_href: data.provider_id ? `/admin/people/${data.provider_id}` : null,
    provider_verification_label: (data.users as { verified?: boolean } | null)?.verified
      ? "Identity verified"
      : "Identity not verified",
    provider_verification_note:
      "Profile identity verification only - not a professional credential or license.",
  });

  const payCount = await auth.context.client
    .from("service_payments")
    .select("id", { count: "exact", head: true })
    .eq("service_id", id);

  return NextResponse.json({
    data: enriched,
    categories: categories.data ?? [],
    subcategories: subcategories.data ?? [],
    bookings: bookings.map((b) =>
      enrichBooking(b, data?.pricing_type as string | undefined),
    ),
    metrics: {
      booking_count: bookings.length,
      payment_count: payCount.count ?? 0,
    },
    dependencies: {
      bookings: bookings.length,
      payments: payCount.count ?? 0,
    },
    definitions: {},
    source: "admin_local_fallback",
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("services:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  if (body.action === "review_featured") {
    const approve = body.approve === true;
    const { data, error } = await auth.context.client.rpc("review_service_featured_request", {
      p_service_id: id,
      p_approve: approve,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const map = (data ?? {}) as { ok?: boolean; error?: string };
    if (map.ok === false) {
      return NextResponse.json({ error: map.error || "Review failed" }, { status: 400 });
    }
    const refreshed = await auth.context.client
      .from("services")
      .select(listingSelect)
      .eq("id", id)
      .maybeSingle();
    return NextResponse.json({
      data: refreshed.data
        ? withServiceMediaUrls(refreshed.data as Record<string, unknown>)
        : data,
    });
  }

  // Moderation via published flip (legacy path) - prefer /moderate
  if ("published" in body && Object.keys(body).every((k) =>
    ["published", "moderation_reason", "action", "reason"].includes(k),
  )) {
    const action = body.published === true ? "approve" : "unpublish";
    const reason = String(body.moderation_reason || body.reason || "");
    const proxied = await proxyPython(`/api/v1/admin/services/${id}/moderate`, {
      method: "POST",
      body: JSON.stringify({ action, reason: reason || null }),
    });
    if (proxied?.res.ok) {
      const detail = (proxied.payload as { detail?: { data?: Record<string, unknown> } })
        .detail;
      return NextResponse.json({
        data: detail?.data ? withServiceMediaUrls(detail.data) : proxied.payload,
        ...proxied.payload,
        source: "python",
      });
    }
    if (proxied && !proxied.res.ok) {
      const err = (proxied.payload as { error?: string; message?: string }).error
        || (proxied.payload as { message?: string }).message
        || "Moderation failed";
      return NextResponse.json({ error: err }, { status: proxied.res.status });
    }
  }

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  // Do not coerce legacy delivery modes
  if ("availability_mode" in patch && patch.availability_mode != null) {
    patch.availability_mode = String(patch.availability_mode).trim().toLowerCase();
  }

  if (Object.keys(patch).length === 0 && !("published" in body) && !("is_featured" in body)) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  if ("published" in body) patch.published = body.published;
  if ("is_featured" in body) patch.is_featured = body.is_featured;

  const proxied = await proxyPython(`/api/v1/admin/services/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...patch,
      expected_updated_at: body.expected_updated_at,
    }),
  });
  if (proxied?.res.ok) {
    const payload = proxied.payload as { data?: Record<string, unknown> };
    return NextResponse.json({
      ...payload,
      data: payload.data ? withServiceMediaUrls(payload.data) : payload.data,
      source: "python",
    });
  }
  if (proxied && proxied.res.status >= 400) {
    const err =
      (proxied.payload as { error?: string; message?: string }).error ||
      (proxied.payload as { message?: string }).message ||
      "Update failed";
    return NextResponse.json({ error: err }, { status: proxied.res.status });
  }

  const { data, error: updateError } = await auth.context.client
    .from("services")
    .update(patch)
    .eq("id", id)
    .select(listingSelect)
    .maybeSingle();
  if (updateError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }
  return NextResponse.json({
    data: withServiceMediaUrls(data as Record<string, unknown>),
    source: "admin_local_fallback",
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("services:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  const proxied = await proxyPython(`/api/v1/admin/services/${id}/archive`, {
    method: "POST",
    body: JSON.stringify({ force }),
  });
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }

  const [{ count: bookingCount }, { count: payCount }] = await Promise.all([
    auth.context.client
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("service_id", id),
    auth.context.client
      .from("service_payments")
      .select("id", { count: "exact", head: true })
      .eq("service_id", id),
  ]);

  if ((bookingCount ?? 0) > 0 || (payCount ?? 0) > 0) {
    const { data, error } = await auth.context.client
      .from("services")
      .update({ published: false, is_featured: false })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      archived: true,
      deleted: false,
      data,
      dependencies: { bookings: bookingCount ?? 0, payments: payCount ?? 0 },
      message: "Archived (unpublished). Bookings and payments preserved.",
    });
  }

  const { error } = await auth.context.client.from("services").delete().eq("id", id);
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, archived: false, deleted: true });
}
