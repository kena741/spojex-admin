import type { SpojexClient } from "@/lib/api/client";
import { pushReadiness, sendUserPush } from "@/lib/push/sendUserPush";

export async function notifyOpportunityWaitlist(
  serviceClient: SpojexClient,
  opportunityId: string,
) {
  const { data: opportunity, error: oppError } = await serviceClient
    .from("opportunities")
    .select("id, title, application_deadline, status, is_published")
    .eq("id", opportunityId)
    .maybeSingle();

  if (oppError) return { ok: false as const, error: oppError.message };
  if (!opportunity) return { ok: false as const, error: "Opportunity not found" };
  if (!opportunity.is_published) {
    return { ok: false as const, error: "Publish the opportunity before notifying waitlist." };
  }

  const { data: waitlist, error: waitError } = await serviceClient
    .from("opportunity_waitlist")
    .select("user_id")
    .eq("opportunity_id", opportunityId)
    .is("notified_at", null);

  if (waitError) return { ok: false as const, error: waitError.message };

  const userIds = [
    ...new Set((waitlist ?? []).map((row: any) => `${row.user_id}`).filter(Boolean)),
  ];

  const deadline = opportunity.application_deadline
    ? new Date(opportunity.application_deadline).toLocaleDateString()
    : "the deadline";
  const title = "Applications are now open!";
  const body = `${opportunity.title} is now accepting applications. Apply before ${deadline}.`;
  const route = `/discover/opportunity/${opportunity.id}`;

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    const { data: profile } = await serviceClient
      .from("users")
      .select("id, fcm_token, notifications_enabled, display_name")
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
      // Still write inbox so they see it in-app when they open notifications.
      await serviceClient.from("notifications").insert({
        user_id: userId,
        kind: "admin",
        title,
        body,
        payload: { type: "admin", route },
      });
      continue;
    }

    const result = await sendUserPush({
      serviceClient,
      userId: String(userId),
      token: String(profile.fcm_token),
      writeInbox: true,
      input: { title, body, route, type: "admin" },
    });

    if (!result.ok) {
      failed += 1;
      if (errors.length < 5) errors.push(result.error);
      continue;
    }
    sent += 1;
  }

  await serviceClient.rpc("mark_opportunity_waitlist_notified", {
    p_opportunity_id: opportunityId,
  });

  return {
    ok: true as const,
    waitlist: userIds.length,
    sent,
    skipped,
    failed,
    errors,
  };
}
