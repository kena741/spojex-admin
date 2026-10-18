import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import {
  bookingEmbedFallback,
  bookingEmbedSelect,
  isMissingRelation,
} from "@/lib/marketplace";
import { withServiceMediaUrls } from "@/lib/services-media";

const allowed = [
  "published",
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
  "*, users:provider_id(id, display_name, verified, avatar_url, role), category:category_id(id, label, emoji), subcategory:subcategory_id(id, label, emoji)";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("services:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;
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
  let bookings = bookingsRich.data ?? [];
  if (bookingsRich.error) {
    if (isMissingRelation(bookingsRich.error.message)) {
      const fallbackBookings = await auth.context.client
        .from("service_requests")
        .select(bookingEmbedFallback)
        .eq("service_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      bookings = fallbackBookings.data ?? [];
    } else {
      bookings = [];
    }
  }
  if (service.error) {
    const fallback = await auth.context.client
      .from("services")
      .select("*, users:provider_id(id, display_name, verified, avatar_url, role)")
      .eq("id", id)
      .maybeSingle();
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 400 });
    }
    if (!fallback.data) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    return NextResponse.json({
      data: withServiceMediaUrls(fallback.data as Record<string, unknown>),
      categories: categories.data ?? [],
      subcategories: subcategories.data ?? [],
      bookings,
    });
  }
  if (!service.data) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }
  return NextResponse.json({
    data: withServiceMediaUrls(service.data as Record<string, unknown>),
    categories: categories.data ?? [],
    subcategories: subcategories.data ?? [],
    bookings,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const refreshed = await auth.context.client.from("services").select(listingSelect).eq("id", id).maybeSingle();
    return NextResponse.json({ data: refreshed.data ?? data });
  }

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
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
  return NextResponse.json({
    data: data ? withServiceMediaUrls(data as Record<string, unknown>) : data,
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("services:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const { error } = await auth.context.client.from("services").delete().eq("id", id);
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
