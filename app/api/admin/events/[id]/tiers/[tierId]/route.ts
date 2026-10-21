import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

const allowed = [
  "name",
  "description",
  "price",
  "currency",
  "capacity",
  "max_per_user",
  "benefits",
  "entry_rules",
  "sale_starts_at",
  "sale_ends_at",
  "sort_order",
  "is_active",
] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; tierId: string }> },
) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id, tierId } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data, error } = await auth.context.client
    .from("event_ticket_tiers")
    .update(patch)
    .eq("id", tierId)
    .eq("event_id", id)
    .select()
    .maybeSingle();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

/**
 * Soft-archive: deactivate the tier so historical tickets/orders keep their
 * referenced tier. Hard delete is refused when any ticket references the tier.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; tierId: string }> },
) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id, tierId } = await params;

  const { count, error: countError } = await auth.context.client
    .from("event_tickets")
    .select("id", { count: "exact", head: true })
    .eq("tier_id", tierId)
    .eq("event_id", id);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 });
  }

  if ((count ?? 0) > 0) {
    const { data, error } = await auth.context.client
      .from("event_ticket_tiers")
      .update({ is_active: false })
      .eq("id", tierId)
      .eq("event_id", id)
      .select()
      .maybeSingle();
    if (error) {
      const hint = missingServiceRoleMessage();
      return NextResponse.json(
        { error: hint ? `${error.message}. ${hint}` : error.message },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      archived: true,
      data,
      message: "Tier deactivated to preserve ticket and payment history.",
    });
  }

  const { error } = await auth.context.client
    .from("event_ticket_tiers")
    .delete()
    .eq("id", tierId)
    .eq("event_id", id);

  if (error) {
    // Fall back to soft-deactivate if FK prevents delete.
    const { data, error: softError } = await auth.context.client
      .from("event_ticket_tiers")
      .update({ is_active: false })
      .eq("id", tierId)
      .eq("event_id", id)
      .select()
      .maybeSingle();
    if (softError) {
      const hint = missingServiceRoleMessage();
      return NextResponse.json(
        {
          error: hint
            ? `${error.message}. Soft-archive also failed: ${softError.message}. ${hint}`
            : `${error.message}. Soft-archive also failed: ${softError.message}`,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      archived: true,
      data,
      message: "Tier deactivated because hard delete was blocked.",
    });
  }
  return NextResponse.json({ ok: true, archived: false });
}
