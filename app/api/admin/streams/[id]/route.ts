import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

const allowed = [
  "name",
  "slug",
  "tagline",
  "stream_url",
  "website_url",
  "image_url",
  "genre",
  "city",
  "status",
  "is_featured",
  "sort_order",
  "host_org_id",
  "host_user_id",
] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("streams:write");
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

  const { data: existing, error: loadError } = await auth.context.client
    .from("radio_streams")
    .select("stream_url, status")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Station not found" }, { status: 404 });
  }

  const nextStatus =
    typeof patch.status === "string" ? patch.status : existing.status;
  const nextStreamUrl =
    typeof patch.stream_url === "string"
      ? patch.stream_url.trim()
      : `${existing.stream_url ?? ""}`.trim();
  if (nextStatus === "active" && !nextStreamUrl) {
    return NextResponse.json(
      { error: "Add a stream URL before turning the station on air." },
      { status: 400 },
    );
  }
  const { data, error: updateError } = await auth.context.client
    .from("radio_streams")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updateError) {
    if (
      ("host_org_id" in patch || "host_user_id" in patch) &&
      /host_org_id|host_user_id|column .* does not exist/i.test(updateError.message)
    ) {
      return NextResponse.json(
        {
          error:
            "Managing org requires migration 098_radio_host_org_gifts.sql. Apply the migration, then retry.",
        },
        { status: 400 },
      );
    }
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("streams:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { error: deleteError } = await auth.context.client.from("radio_streams").delete().eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
