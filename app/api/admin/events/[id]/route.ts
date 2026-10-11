import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

const allowed = [
  "name",
  "slug",
  "venue_name",
  "location",
  "address",
  "starts_at",
  "ends_at",
  "ticket_price",
  "currency",
  "capacity",
  "photos",
  "image_url",
  "description",
  "status",
  "is_upcoming",
  "category",
  "visibility",
  "lifecycle",
  "service_fee_percent",
  "important_info",
  "entry_rules",
  "organizer_name",
  "organizer_info",
  "schedule",
  "sponsors",
  "sales_starts_at",
  "sales_ends_at",
  "invite_token",
  "latitude",
  "longitude",
] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:write");
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
  const { data, error } = await auth.context.client
    .from("events")
    .update(patch)
    .eq("id", id)
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const { error } = await auth.context.client.from("events").delete().eq("id", id);
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
