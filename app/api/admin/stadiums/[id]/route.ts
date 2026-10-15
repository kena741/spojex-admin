import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

const allowed = [
  "name",
  "slug",
  "location",
  "address",
  "latitude",
  "longitude",
  "size_type",
  "surface",
  "capacity",
  "photos",
  "image_url",
  "facilities",
  "description",
  "owner_name",
  "owner_user_id",
  "contact_phone",
  "contact_email",
  "status",
  "pricing",
] as const;

/**
 * Child cleanup before deleting the stadium row.
 * Most stadium_* FKs are ON DELETE CASCADE, but stadium_subscriptions.plan_id
 * is ON DELETE RESTRICT against stadium_plans — so plans cannot cascade-delete
 * while subscriptions still reference them. We clear dependents in the app.
 * Keep this to 2 round-trips (payments → rest in parallel), not 7 serial REST calls.
 */
const STADIUM_PAYMENTS = "stadium_payments" as const;
const STADIUM_CHILD_TABLES = [
  "stadium_bookings",
  "stadium_subscriptions",
  "stadium_availability",
  "stadium_managers",
  "stadium_issues",
] as const;

function isMissingTableError(message: string) {
  const msg = message.toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("undefined_table") ||
    msg.includes("not found") ||
    msg.includes("couldn't find") ||
    msg.includes("could not find") ||
    msg.includes("unknown table") ||
    msg.includes("could not find the table")
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }
  const { data, error: updateError } = await auth.context.client
    .from("stadiums")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updateError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const client = auth.context.client;
  const hint = missingServiceRoleMessage();

  // 1) Payments first (FK to bookings + subscriptions).
  {
    const { error } = await client.from(STADIUM_PAYMENTS).delete().eq("stadium_id", id);
    if (error && !isMissingTableError(error.message || "")) {
      return NextResponse.json(
        {
          error: hint
            ? `Could not clear ${STADIUM_PAYMENTS}: ${error.message}. ${hint}`
            : `Could not clear ${STADIUM_PAYMENTS}: ${error.message}`,
        },
        { status: 400 },
      );
    }
  }

  // 2) Remaining children in parallel (one RTT, not five serial).
  const childResults = await Promise.all(
    STADIUM_CHILD_TABLES.map(async (table) => {
      const { error } = await client.from(table).delete().eq("stadium_id", id);
      return { table, error };
    }),
  );
  for (const { table, error } of childResults) {
    if (!error || isMissingTableError(error.message || "")) continue;
    return NextResponse.json(
      {
        error: hint
          ? `Could not clear ${table}: ${error.message}. ${hint}`
          : `Could not clear ${table}: ${error.message}`,
      },
      { status: 400 },
    );
  }

  // 3) Stadium row (plans cascade once subscriptions are gone).
  const { error: deleteError } = await client.from("stadiums").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
