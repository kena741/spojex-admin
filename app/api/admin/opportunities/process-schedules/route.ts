import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { notifyOpportunityWaitlist } from "@/lib/opportunity-waitlist-notify";
import { requestAccessToken } from "@/lib/spojex/server";

/** Auto-open / auto-close by schedule, then fan-out waitlist for newly opened (deduped). */
export async function POST() {
  const auth = await requireAdminPermission("opportunities:write");
  if (!auth.ok) return auth.error;

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/opportunities/process-schedules`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        },
      );
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        const schedules = (payload.schedules || payload) as {
          opened_ids?: string[];
        };
        const openedIds = Array.isArray(schedules.opened_ids)
          ? schedules.opened_ids.map(String)
          : Array.isArray(payload.opened_ids)
            ? (payload.opened_ids as string[]).map(String)
            : [];
        const notifies = [];
        for (const id of openedIds) {
          notifies.push(await notifyOpportunityWaitlist(auth.context.client, id));
        }
        return NextResponse.json({
          ok: true,
          ...payload,
          notifies,
          source: payload.source || "python",
        });
      }
    } catch {
      // fall through
    }
  }

  const { data, error } = await auth.context.client.rpc("process_opportunity_schedules");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const openedIds = Array.isArray(data?.opened_ids) ? data.opened_ids.map(String) : [];
  const notifies = [];
  for (const id of openedIds) {
    notifies.push(await notifyOpportunityWaitlist(auth.context.client, id));
  }

  return NextResponse.json({
    ok: true,
    schedules: data,
    notifies,
    source: "rpc",
    behavior:
      "Opens published coming_soon when application_opens_at ≤ now; closes open when deadline ≤ now. Waitlist notified once via notified_at.",
  });
}
