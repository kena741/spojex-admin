import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { notifyOpportunityWaitlist } from "@/lib/opportunity-waitlist-notify";

/** Auto-open / auto-close by schedule, then fan-out waitlist for newly opened. */
export async function POST() {
  const auth = await requireAdminPermission("opportunities:write");
  if (!auth.ok) return auth.error;

  const { data, error } = await auth.context.client.rpc("process_opportunity_schedules");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const openedIds = Array.isArray(data?.opened_ids)
    ? data.opened_ids.map(String)
    : [];

  const notifies = [];
  for (const id of openedIds) {
    notifies.push(await notifyOpportunityWaitlist(auth.context.client, id));
  }

  return NextResponse.json({
    ok: true,
    schedules: data,
    notifies,
  });
}
