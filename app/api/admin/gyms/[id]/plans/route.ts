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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const { data, error } = await auth.context.client
    .from("gym_plans")
    .select("*")
    .eq("gym_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id: gymId } = await params;
  const body = (await request.json()) as {
    title?: string;
    description?: string;
    price_amount?: number;
    currency?: string;
    duration_months?: number;
    is_active?: boolean;
    sort_order?: number;
    benefits?: string[];
  };

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const months = Math.max(1, Math.floor(Number(body.duration_months) || 1));
  const price = Number(body.price_amount);
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Price must be 0 or more" }, { status: 400 });
  }

  const { data, error } = await auth.context.client
    .from("gym_plans")
    .insert({
      gym_id: gymId,
      title,
      description: body.description?.trim() ?? "",
      plan_type: planTypeForMonths(months),
      benefits: Array.isArray(body.benefits) ? body.benefits : [],
      price_amount: price,
      currency: body.currency?.trim() || "ETB",
      duration_months: months,
      duration_days: months * 30,
      access_restrictions: "",
      is_active: body.is_active !== false,
      sort_order: Number(body.sort_order) || 0,
    })
    .select()
    .single();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
