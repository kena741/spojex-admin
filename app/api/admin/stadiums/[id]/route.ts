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

/** Child tables that reference stadiums.id (delete before the stadium row). */
const STADIUM_CHILD_TABLES = [
  // payments first — FKs to bookings + subscriptions
  "stadium_payments",
  "stadium_bookings",
  "stadium_subscriptions",
  "stadium_availability",
  "stadium_managers",
  "stadium_issues",
] as const;

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

  for (const table of STADIUM_CHILD_TABLES) {
    const { error } = await client.from(table).delete().eq("stadium_id", id);
    if (!error) continue;
    const msg = (error.message || "").toLowerCase();
    // Ignore missing/empty child tables; surface real FK/permission failures.
    if (
      msg.includes("does not exist") ||
      msg.includes("undefined_table") ||
      msg.includes("not found") ||
      msg.includes("couldn't find") ||
      msg.includes("could not find") ||
      msg.includes("unknown table") ||
      msg.includes("could not find the table")
    ) {
      continue;
    }
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      {
        error: hint
          ? `Could not clear ${table}: ${error.message}. ${hint}`
          : `Could not clear ${table}: ${error.message}`,
      },
      { status: 400 },
    );
  }

  const { error: deleteError } = await client.from("stadiums").delete().eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
