import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { applicationStatuses } from "@/lib/opportunities";
import { sendUserPush, pushReadiness } from "@/lib/push/sendUserPush";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("opportunities:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as {
    status?: string;
    admin_note?: string;
    notify?: boolean;
  };

  const status = body.status?.trim();
  if (!status || !(applicationStatuses as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid application status" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { status };
  if (typeof body.admin_note === "string") {
    patch.admin_note = body.admin_note.trim();
  }

  const { data, error } = await auth.context.client
    .from("opportunity_applications")
    .update(patch)
    .eq("id", id)
    .select(
      "id, opportunity_id, user_id, status, payment_status, amount_paid, message, profile_completion_percent, admin_note, submitted_at, created_at",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  let notified = false;
  if (body.notify === true) {
    const { data: opp } = await auth.context.client
      .from("opportunities")
      .select("title")
      .eq("id", data.opportunity_id)
      .maybeSingle();
    const { data: profile } = await auth.context.client
      .from("users")
      .select("id, fcm_token, notifications_enabled, display_name")
      .eq("id", data.user_id)
      .maybeSingle();

    const title = "Application update";
    const message = `Your application for “${opp?.title ?? "an opportunity"}” is now ${status.replaceAll("_", " ")}.`;
    const route = `/discover/opportunity/${data.opportunity_id}`;

    if (profile) {
      const readiness = pushReadiness(profile);
      if (readiness.canSend && profile.fcm_token) {
        await sendUserPush({
          serviceClient: auth.context.client,
          userId: profile.id,
          token: profile.fcm_token,
          input: { title, body: message, route, type: "admin" },
        });
        notified = true;
      } else {
        await auth.context.client.from("notifications").insert({
          user_id: profile.id,
          kind: "admin",
          title,
          body: message,
          payload: { type: "admin", route },
        });
        notified = true;
      }
    }
  }

  return NextResponse.json({ data, notified });
}
