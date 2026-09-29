import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission(["streams:read", "reports:read", "messages:read"]);
  if (!auth.ok) return auth.error;

  const streamId = new URL(request.url).searchParams.get("stream");
  const client = auth.context.client;

  let messagesQuery = client
    .from("radio_chat_messages")
    .select("*, radio_streams:stream_id(id, name), users:user_id(id, display_name, username)")
    .order("created_at", { ascending: false })
    .limit(400);
  let reportsQuery = client
    .from("radio_chat_reports")
    .select(
      "*, radio_streams:stream_id(id, name), reporter:reporter_id(id, display_name), target:target_user_id(id, display_name), radio_chat_messages:message_id(id, message, status)",
    )
    .order("created_at", { ascending: false })
    .limit(400);

  if (streamId) {
    messagesQuery = messagesQuery.eq("stream_id", streamId);
    reportsQuery = reportsQuery.eq("stream_id", streamId);
  }

  let messages = await messagesQuery;
  if (messages.error) {
    let fallback = client
      .from("radio_chat_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(400);
    if (streamId) fallback = fallback.eq("stream_id", streamId);
    messages = await fallback;
  }

  let reports = await reportsQuery;
  if (reports.error) {
    let fallback = client
      .from("radio_chat_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(400);
    if (streamId) fallback = fallback.eq("stream_id", streamId);
    reports = await fallback;
  }

  const error = messages.error || reports.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    messages: messages.data ?? [],
    reports: reports.data ?? [],
  });
}
