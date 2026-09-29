import { NextResponse } from "next/server";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { orderedPair } from "@/lib/network";

const ACTIONS = new Set(["accept", "decline", "cancel"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("network:write");
  if (!auth.ok) return auth.error;

  const { id } = await params;
  const body = (await request.json()) as { action?: string };
  const action = body.action?.trim().toLowerCase();
  if (!action || !ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "action must be accept, decline, or cancel" },
      { status: 400 },
    );
  }

  const client = auth.context.client;
  const { data: existing, error: loadError } = await client
    .from("connection_requests")
    .select("id, requester_id, addressee_id, status")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${loadError.message}. ${hint}` : loadError.message },
      { status: 400 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json(
      { error: `Request is already ${existing.status}` },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  if (action === "accept") {
    const [userA, userB] = orderedPair(existing.requester_id, existing.addressee_id);
    const { error: updateError } = await client
      .from("connection_requests")
      .update({ status: "accepted", responded_at: now })
      .eq("id", id)
      .eq("status", "pending");
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const { error: insertError } = await client.from("connections").insert({
      user_a: userA,
      user_b: userB,
    });
    if (insertError && !/duplicate|unique/i.test(insertError.message)) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    await logAdminActivity({
      context: auth.context,
      request,
      action: "network.accept_request",
      resource_type: "connection_request",
      resource_id: id,
      summary: `Accepted connection request ${id.slice(0, 8)}`,
      metadata: {
        requester_id: existing.requester_id,
        addressee_id: existing.addressee_id,
      },
    });

    return NextResponse.json({ ok: true, status: "accepted" });
  }

  const nextStatus = action === "decline" ? "declined" : "cancelled";
  const { error: updateError } = await client
    .from("connection_requests")
    .update({ status: nextStatus, responded_at: now })
    .eq("id", id)
    .eq("status", "pending");

  if (updateError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: `network.${action}_request`,
    resource_type: "connection_request",
    resource_id: id,
    summary: `${action === "decline" ? "Declined" : "Cancelled"} connection request ${id.slice(0, 8)}`,
    metadata: {
      requester_id: existing.requester_id,
      addressee_id: existing.addressee_id,
      status: nextStatus,
    },
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
