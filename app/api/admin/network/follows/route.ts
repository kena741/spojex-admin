import { NextResponse } from "next/server";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function DELETE(request: Request) {
  const auth = await requireAdminPermission("network:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    follower_id?: string;
    following_id?: string;
  };
  if (!body.follower_id || !body.following_id) {
    return NextResponse.json(
      { error: "follower_id and following_id are required" },
      { status: 400 },
    );
  }

  const { error } = await auth.context.client
    .from("follows")
    .delete()
    .eq("follower_id", body.follower_id)
    .eq("following_id", body.following_id);

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }

  await logAdminActivity({
    context: auth.context,
    request,
    action: "network.remove_follow",
    resource_type: "follow",
    resource_id: `${body.follower_id}:${body.following_id}`,
    summary: `Removed follow ${body.follower_id.slice(0, 8)} → ${body.following_id.slice(0, 8)}`,
    metadata: body,
  });

  return NextResponse.json({ ok: true });
}
