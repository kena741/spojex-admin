import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import {
  pushReadiness,
  sendUserPush,
  type PushDeliveryInput,
  type UserPushProfile,
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

export async function POST(request: Request) {
  const auth = await requireAdminPermission("notifications:write");
  if (!auth.ok) return auth.error;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseBody(raw);
  if (typeof parsed === "string") {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  const { data: users, error } = await auth.context.client
    .from("users")
    .select("id, fcm_token, notifications_enabled, display_name")
    .not("fcm_token", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const errors: string[] = [];
  const results = {
    attempted: (users ?? []).length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const user of users ?? []) {
    const profile = user as UserPushProfile;
    const readiness = pushReadiness(profile);
    if (!readiness.canSend || !profile.fcm_token) {
      results.skipped += 1;
      continue;
    }

    const res = await sendUserPush({
      serviceClient: auth.context.client,
      userId: profile.id,
      token: profile.fcm_token,
      input: parsed,
    });

    if (!res.ok) {
      results.failed += 1;
      if (errors.length < 5) {
        errors.push(res.error);
      }
      continue;
    }

    results.sent += 1;
  }

  return NextResponse.json({
    ok: results.failed === 0,
    ...results,
    error: errors[0],
    errors,
  });
}
