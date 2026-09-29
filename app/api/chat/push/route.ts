import { NextResponse } from "next/server";
import { authenticatePushRequest } from "@/lib/push/pushRouteAuth";
import { pushReadiness, sendUserPush } from "@/lib/push/sendUserPush";

function messagePreview(row: {
  type?: string | null;
  body?: string | null;
  deleted_at?: string | null;
}) {
  if (row.deleted_at) return "Message deleted";
  if (row.type === "image") return "Photo";
  if (row.type === "video") return "Video";
  if (row.type === "audio") return "Voice message";
  if (row.type === "file") return "File";
  if (row.type === "profile") return "Shared a profile";
  const text = (row.body ?? "").trim();
  return text.length > 120 ? `${text.slice(0, 117)}…` : text || "New message";
}

export async function POST(request: Request) {
  const auth = await authenticatePushRequest(request);
  if ("error" in auth) return auth.error;

  let body: { message_id?: string };
  try {
    body = (await request.json()) as { message_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messageId = body.message_id?.trim();
  if (!messageId) {
    return NextResponse.json({ error: "message_id is required" }, { status: 400 });
  }

  const { serviceClient, publicUserId } = auth;

  const { data: message, error: messageError } = await serviceClient
    .from("messages")
    .select("id, body, type, sender_id, conversation_id, deleted_at")
    .eq("id", messageId)
    .maybeSingle();

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (`${message.sender_id}` !== publicUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: conversation } = await serviceClient
    .from("conversations")
    .select("id, state")
    .eq("id", message.conversation_id)
    .maybeSingle();

  const { data: members, error: membersError } = await serviceClient
    .from("conversation_members")
    .select("user_id, hidden, muted")
    .eq("conversation_id", message.conversation_id)
    .neq("user_id", publicUserId);

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  const { data: sender } = await serviceClient
    .from("users")
    .select("display_name")
    .eq("id", publicUserId)
    .maybeSingle();

  const senderName = `${sender?.display_name ?? ""}`.trim() || "Someone";
  const preview = messagePreview(message);
  const isRequest = conversation?.state === "request";
  const title = isRequest ? "Message request" : senderName;
  const text = isRequest ? `${senderName}: ${preview}` : preview;

  const recipientIds = [
    ...new Set(
      (members ?? [])
        .filter((row) => !row.hidden && !row.muted && row.user_id)
        .map((row) => `${row.user_id}`),
    ),
  ].slice(0, 80);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const userId of recipientIds) {
    const { data: profile } = await serviceClient
      .from("users")
      .select(
        "id, fcm_token, notifications_enabled, display_name, active_conversation_id",
      )
      .eq("id", userId)
      .maybeSingle();

    const readiness = pushReadiness(
      profile ?? {
        id: userId,
        fcm_token: null,
        notifications_enabled: true,
        display_name: null,
      },
    );
    if (!readiness.canSend || !profile?.fcm_token) {
      skipped += 1;
      continue;
    }

    // Skip members currently open in this chat (Telegram-style).
    if (
      profile.active_conversation_id &&
      `${profile.active_conversation_id}` === `${message.conversation_id}`
    ) {
      skipped += 1;
      continue;
    }

    const result = await sendUserPush({
      serviceClient,
      userId,
      token: profile.fcm_token,
      writeInbox: false,
      input: {
        title,
        body: text,
        type: isRequest ? "message_request" : "message",
        route: `/chat/${message.conversation_id}`,
        conversation_id: `${message.conversation_id}`,
      },
    });

    if (!result.ok) {
      failed += 1;
      if (errors.length < 5) errors.push(result.error);
      continue;
    }
    sent += 1;
  }

  return NextResponse.json({
    ok: failed === 0,
    attempted: recipientIds.length,
    sent,
    skipped,
    failed,
    error: errors[0],
  });
}
