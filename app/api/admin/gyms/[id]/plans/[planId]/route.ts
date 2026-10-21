import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

function planTypeForMonths(months: number) {
  switch (months) {
    case 1:
      return "monthly";
    case 3:
      return "quarterly";
    case 6:
      return "semi_annual";
    case 12:
      return "annual";
    default:
      return "custom";
  }
}

const allowed = [
  "title",
  "description",
  "price_amount",
  "currency",
  "duration_months",
  "is_active",
  "sort_order",
  "benefits",
] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id: gymId, planId } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  if ("title" in patch) {
    const title = `${patch.title ?? ""}`.trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    patch.title = title;
  }
  if ("description" in patch) {
    patch.description = `${patch.description ?? ""}`.trim();
  }
  if ("currency" in patch) {
    patch.currency = `${patch.currency ?? ""}`.trim() || "ETB";
  }
  if ("price_amount" in patch) {
    const price = Number(patch.price_amount);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Price must be 0 or more" }, { status: 400 });
    }
    patch.price_amount = price;
  }
  if ("duration_months" in patch) {
    const months = Math.max(1, Math.floor(Number(patch.duration_months) || 1));
    patch.duration_months = months;
    patch.duration_days = months * 30;
    patch.plan_type = planTypeForMonths(months);
  }
  if ("sort_order" in patch) {
    patch.sort_order = Number(patch.sort_order) || 0;
  }
  if ("is_active" in patch) {
    patch.is_active = Boolean(patch.is_active);
  }
  if ("benefits" in patch && !Array.isArray(patch.benefits)) {
    patch.benefits = [];
  }

  const { data, error } = await auth.context.client
    .from("gym_plans")
    .update(patch)
    .eq("id", planId)
    .eq("gym_id", gymId)
    .select()
    .maybeSingle();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id: gymId, planId } = await params;

  // Never hard-delete plans — preserve history for past memberships / payments.
  const { data, error } = await auth.context.client
    .from("gym_plans")
    .update({ is_active: false })
    .eq("id", planId)
    .eq("gym_id", gymId)
    .select()
    .maybeSingle();
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    deactivated: true,
    data,
    message: "Plan deactivated. Past memberships keep their purchased price/duration snapshot.",
  });
}
