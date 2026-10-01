import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function GET() {
  const auth = await requireAdminPermission("messages:read");
  if (!auth.ok) return auth.error;
  const { data, error } = await auth.context.client
    .from("messages")
    .select("id, conversation_id, sender_id, body, media_path, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const messages = (data ?? []) as Array<{
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string | null;
    media_path?: string | null;
    created_at: string;
  }>;
  const conversationIds = [...new Set(messages.map((row) => row.conversation_id))];
  const conversationMap = new Map<string, { type: string; title: string | null; state: string }>();
  if (conversationIds.length > 0) {
    const { data: conversations } = await auth.context.client
      .from("conversations")
      .select("id, type, title, state")
      .in("id", conversationIds);
    for (const conversation of conversations ?? []) {
      conversationMap.set(conversation.id, {
        type: conversation.type,
        title: conversation.title,
        state: conversation.state,
      });
    }
  }
  const enriched = messages.map((row) => ({
    ...row,
    conversation: conversationMap.get(row.conversation_id) ?? null,
  }));
  return NextResponse.json({ data: enriched });
}
