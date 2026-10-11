import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

const paidStatuses = new Set(["confirmed", "used", "pending"]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const [tiersRes, ticketsRes] = await Promise.all([
    auth.context.client
      .from("event_ticket_tiers")
      .select("*")
      .eq("event_id", id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    auth.context.client
      .from("event_tickets")
      .select("tier_id, quantity, status")
      .eq("event_id", id)
      .in("status", ["pending", "confirmed", "used"]),
  ]);

  if (tiersRes.error) {
    // Migration may not be applied yet — return empty rather than hard-failing the page.
    if (tiersRes.error.message.toLowerCase().includes("event_ticket_tiers")) {
      return NextResponse.json({ data: [] });
    }
    return NextResponse.json({ error: tiersRes.error.message }, { status: 400 });
  }

  const soldByTier: Record<string, number> = {};
  for (const row of ticketsRes.data ?? []) {
    const tierId = `${row.tier_id ?? ""}`;
    if (!tierId) continue;
    if (!paidStatuses.has(`${row.status ?? ""}`)) continue;
    soldByTier[tierId] = (soldByTier[tierId] ?? 0) + Math.max(1, Number(row.quantity || 1));
  }

  const data = (tiersRes.data ?? []).map((tier: any) => {
    const sold = soldByTier[tier.id] ?? 0;
    const capacity = Number(tier.capacity || 0);
    return {
      ...tier,
      sold,
      remaining: capacity > 0 ? Math.max(0, capacity - sold) : null,
    };
  });

  return NextResponse.json({ data });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as {
    name?: string;
    description?: string;
    price?: number;
    currency?: string;
    capacity?: number;
    max_per_user?: number;
    benefits?: string;
    entry_rules?: string;
    sale_starts_at?: string | null;
    sale_ends_at?: string | null;
    sort_order?: number;
    is_active?: boolean;
  };

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Tier name is required" }, { status: 400 });

  const { data, error } = await auth.context.client
    .from("event_ticket_tiers")
    .insert({
      event_id: id,
      name,
      description: body.description?.trim() ?? "",
      price: Number(body.price ?? 0),
      currency: body.currency?.trim() || "ETB",
      capacity: Number(body.capacity ?? 0),
      max_per_user: Math.max(1, Number(body.max_per_user ?? 10)),
      benefits: body.benefits?.trim() ?? "",
      entry_rules: body.entry_rules?.trim() ?? "",
      sale_starts_at: body.sale_starts_at || null,
      sale_ends_at: body.sale_ends_at || null,
      sort_order: Number(body.sort_order ?? 0),
      is_active: body.is_active !== false,
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
