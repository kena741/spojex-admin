import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import {
  fetchUserPushProfile,
  pushReadiness,
  sendUserPush,
  type PushDeliveryInput,
} from "@/lib/push/sendUserPush";

function parseBody(body: unknown): PushDeliveryInput | string {
  if (!body || typeof body !== "object") return "Invalid request body";

  const data = body as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const messageBody = typeof data.body === "string" ? data.body.trim() : "";
  const route = typeof data.route === "string" ? data.route.trim() : undefined;

  if (!title) return "Title is required";
  if (!messageBody) return "Message body is required";

  return { title, body: messageBody, route, type: "admin" };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("notifications:write");
  if (!auth.ok) return auth.error;

  const { id: userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ error: "User id is required" }, { status: 400 });
  }

  const { profile, error } = await fetchUserPushProfile(auth.context.client, userId);
  if (error) {
    return NextResponse.json({ error }, { status: error === "User not found" ? 404 : 400 });
  }

  const readiness = pushReadiness(profile!);

  return NextResponse.json({
    fcmRegistered: Boolean(profile!.fcm_token),
    notificationsEnabled: profile!.notifications_enabled !== false,
    canSend: readiness.canSend,
    reason: readiness.reason,
    displayName: profile!.display_name,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("notifications:write");
  if (!auth.ok) return auth.error;

  const { id: userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ error: "User id is required" }, { status: 400 });
  }

  const parsed = parseBody(await request.json());
  if (typeof parsed === "string") {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  const { profile, error } = await fetchUserPushProfile(auth.context.client, userId);
  if (error) {
    return NextResponse.json({ error }, { status: error === "User not found" ? 404 : 400 });
  }

  const readiness = pushReadiness(profile!);
  if (!readiness.canSend) {
    return NextResponse.json({ error: readiness.reason }, { status: 400 });
  }

  const result = await sendUserPush({
    serviceClient: auth.context.client,
    userId,
    token: profile!.fcm_token!,
    input: parsed,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, clearedToken: result.clearedToken },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    messageId: result.messageId,
    recipient: profile!.display_name ?? userId,
  });
}
