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
 * Child cleanup order matters: payments reference bookings + subscriptions.
 * Spojex API FK errors are friendly ("related item…") without "foreign key" text,
 * so we always clear dependents before deleting the stadium.
 */
const STADIUM_CHILD_TABLES = [
  "stadium_payments",
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

function isFkOrRelatedError(message: string, code?: string) {
  const msg = message.toLowerCase();
  if (code === "invalid_reference" || code === "db_error") return true;
  return (
    msg.includes("foreign key") ||
    msg.includes("violates") ||
    msg.includes("still referenced") ||
    msg.includes("restrict") ||
    msg.includes("related item") ||
    msg.includes("invalid_reference")
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

  // Clear dependents first (API returns friendly FK text, not "foreign key").
  for (const table of STADIUM_CHILD_TABLES) {
    const { error } = await client.from(table).delete().eq("stadium_id", id);
    if (error && !isMissingTableError(error.message || "")) {
      return NextResponse.json(
        {
          error: hint
            ? `Could not clear ${table}: ${error.message}. ${hint}`
            : `Could not clear ${table}: ${error.message}`,
        },
        { status: 400 },
      );
    }
  }

  const { error: deleteError } = await client.from("stadiums").delete().eq("id", id);
  if (!deleteError) {
    return NextResponse.json({ ok: true });
  }

  // Rare: another FK we do not know about — report clearly.
  const msg = deleteError.message || "Delete failed";
  if (isFkOrRelatedError(msg, deleteError.code)) {
    return NextResponse.json(
      {
        error: hint
          ? `Stadium still has related records. ${msg}. ${hint}`
          : `Stadium still has related records. ${msg}`,
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: hint ? `${msg}. ${hint}` : msg },
    { status: 400 },
  );
}
