import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticatePushRequest } from "@/lib/push/pushRouteAuth";
import { pushReadiness, sendUserPush } from "@/lib/push/sendUserPush";

type ConnectionPushBody = {
  action?: string;
  request_id?: string;
  conversation_id?: string;
};

async function deliverConnectionPush({
  serviceClient,
  fromUserId,
  toUserId,
  title,
  body,
  conversationId,
}: {
  serviceClient: SupabaseClient;
  fromUserId: string;
  toUserId: string;
  title: string;
  body: string;
  conversationId?: string;
}) {
  const { data: profile } = await serviceClient
    .from("users")
    .select("id, fcm_token, notifications_enabled, display_name")
    .eq("id", toUserId)
    .maybeSingle();

  const readiness = pushReadiness(
    profile ?? {
      id: toUserId,
      fcm_token: null,
      notifications_enabled: true,
      display_name: null,
    },
  );
  if (!readiness.canSend || !profile?.fcm_token) {
    return NextResponse.json({ ok: true, skipped: readiness.reason ?? "No FCM token" });
  }

  const { data: sender } = await serviceClient
    .from("users")
    .select("display_name")
    .eq("id", fromUserId)
    .maybeSingle();
  const name = `${sender?.display_name ?? ""}`.trim() || "Someone";

  const result = await sendUserPush({
    serviceClient,
    userId: toUserId,
    token: profile.fcm_token,
    writeInbox: false,
    input: {
      title,
      body: body.replace("{name}", name),
      type: "connection",
      route: "/notifications",
      conversation_id: conversationId,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, messageId: result.messageId });
}

export async function POST(request: Request) {
  const auth = await authenticatePushRequest(request);
  if ("error" in auth) return auth.error;

  let body: ConnectionPushBody;
  try {
    body = (await request.json()) as ConnectionPushBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action?.trim();
  const requestId = body.request_id?.trim();
  const conversationId = body.conversation_id?.trim();
  const { serviceClient, publicUserId } = auth;

  if (action === "request") {
    if (!requestId) {
      return NextResponse.json({ error: "request_id is required" }, { status: 400 });
    }
    const { data: row, error } = await serviceClient
      .from("connection_requests")
      .select("id, requester_id, addressee_id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (`${row.requester_id}` !== publicUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return deliverConnectionPush({
      serviceClient,
      fromUserId: publicUserId,
      toUserId: `${row.addressee_id}`,
      title: "New connection request",
      body: "{name} wants to connect",
    });
  }

  if (action === "accept") {
    if (requestId) {
      const { data: row, error } = await serviceClient
        .from("connection_requests")
        .select("id, requester_id, addressee_id, status")
        .eq("id", requestId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 });
      if (`${row.addressee_id}` !== publicUserId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return deliverConnectionPush({
        serviceClient,
        fromUserId: publicUserId,
        toUserId: `${row.requester_id}`,
        title: "Request accepted",
        body: "{name} accepted your connection request",
      });
    }

    if (conversationId) {
      const { data: members, error } = await serviceClient
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const ids = (members ?? []).map((row) => `${row.user_id}`);
      if (!ids.includes(publicUserId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const otherId = ids.find((id) => id !== publicUserId);
      if (!otherId) {
        return NextResponse.json({ ok: true, skipped: "No other member" });
      }
      return deliverConnectionPush({
        serviceClient,
        fromUserId: publicUserId,
        toUserId: otherId,
        title: "Request accepted",
        body: "{name} accepted your message request",
        conversationId,
      });
    }

    return NextResponse.json({ error: "request_id or conversation_id is required" }, { status: 400 });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
