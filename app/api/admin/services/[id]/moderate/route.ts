import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { withServiceMediaUrls } from "@/lib/services-media";
import { requestAccessToken } from "@/lib/spojex/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("services:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as { action?: string; reason?: string };
  if (!body.action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/services/${id}/moderate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: body.action,
            reason: body.reason || null,
          }),
          cache: "no-store",
        },
      );
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        const detail = payload.detail as { data?: Record<string, unknown> } | undefined;
        return NextResponse.json({
          ...payload,
          data: detail?.data ? withServiceMediaUrls(detail.data) : undefined,
          source: "python",
        });
      }
      return NextResponse.json(
        {
          error:
            (payload.error as string) ||
            (payload.message as string) ||
            "Moderation failed",
        },
        { status: res.status },
      );
    } catch {
      // fall through
    }
  }

  // Local fallback
  const reasonNeeded = ["reject", "request_changes", "unpublish"].includes(body.action);
  if (reasonNeeded && !String(body.reason || "").trim()) {
    return NextResponse.json(
      { error: "A reason is required for this action" },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (body.action === "approve") patch.published = true;
  else if (["unpublish", "reject", "request_changes"].includes(body.action)) {
    patch.published = false;
  } else if (body.action === "feature") patch.is_featured = true;
  else if (body.action === "unfeature") patch.is_featured = false;
  else {
    return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }

  const { data, error } = await auth.context.client
    .from("services")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    action: body.action,
    data: withServiceMediaUrls(data as Record<string, unknown>),
    publishes_immediately: body.action === "approve",
    source: "admin_local_fallback",
  });
}
