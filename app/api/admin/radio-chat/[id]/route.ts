import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAnyAdminPermission } from "@/lib/admin-auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermission(["streams:write", "reports:write"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as { action?: string };
  if (body.action !== "hide") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const { data, error } = await auth.context.client
    .from("radio_chat_messages")
    .update({ status: "hidden", deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  return NextResponse.json({ data });
}
