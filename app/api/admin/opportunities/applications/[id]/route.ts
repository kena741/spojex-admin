import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { applicationStatuses } from "@/lib/opportunities";
import {
  APPLICATION_TRANSITIONS,
  reasonRequiredFor,
} from "@/lib/opportunity-payment";
import { sendUserPush, pushReadiness } from "@/lib/push/sendUserPush";
import { requestAccessToken } from "@/lib/spojex/server";

async function proxyPython(path: string, init?: RequestInit) {
  const token = await requestAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${getSpojexApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    const payload = await res.json().catch(() => ({}));
    return { res, payload };
  } catch {
    return null;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("opportunities:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as {
    status?: string;
    reason?: string;
    admin_note?: string;
    internal_note?: string;
    applicant_message?: string;
    expected_updated_at?: string;
    notify?: boolean;
  };

  const status = body.status?.trim();
  if (!status || !(applicationStatuses as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid application status" }, { status: 400 });
  }
  if (reasonRequiredFor(status) && !(body.reason || "").trim()) {
    return NextResponse.json(
      { error: "A reason is required for rejection or withdrawal" },
      { status: 400 },
    );
  }

  const proxied = await proxyPython(`/api/v1/admin/opportunities/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      reason: body.reason || "",
      internal_note: body.internal_note || body.admin_note || null,
      applicant_message: body.applicant_message || null,
      expected_updated_at: body.expected_updated_at || null,
    }),
  });
  if (proxied?.res.ok) {
    // Optional notify still handled locally (Python review does not send push)
    let notified = false;
    if (body.notify === true) {
      notified = await maybeNotify(auth.context.client, id, status);
    }
    return NextResponse.json({ ...proxied.payload, notified, source: "python" });
  }
  if (proxied && proxied.res.status >= 400 && proxied.res.status !== 404) {
    const detail =
      (proxied.payload as { detail?: { message?: string }; message?: string; error?: string })
        ?.detail?.message ||
      (proxied.payload as { message?: string })?.message ||
      (proxied.payload as { error?: string })?.error ||
      "Review failed";
    return NextResponse.json({ error: detail }, { status: proxied.res.status });
  }

  // Local fallback with transition checks
  const { data: current, error: loadError } = await auth.context.client
    .from("opportunity_applications")
    .select("id, opportunity_id, user_id, status, admin_note, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  if (
    body.expected_updated_at &&
    current.updated_at &&
    String(current.updated_at).slice(0, 19) !== body.expected_updated_at.slice(0, 19)
  ) {
    return NextResponse.json(
      { error: "Application was updated elsewhere. Refresh and try again.", code: "conflict" },
      { status: 409 },
    );
  }

  if (current.status === status) {
    return NextResponse.json({
      ok: true,
      idempotent: true,
      id,
      status,
      data: current,
    });
  }

  const allowed = APPLICATION_TRANSITIONS[String(current.status).toLowerCase()] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Cannot transition from ${current.status} to ${status}` },
      { status: 400 },
    );
  }

  const noteParts: string[] = [];
  const internal = (body.internal_note || body.admin_note || "").trim();
  if (internal) noteParts.push(internal);
  if ((body.reason || "").trim()) noteParts.push(`[${status}] ${body.reason!.trim()}`);
  if ((body.applicant_message || "").trim()) {
    noteParts.push(`[applicant] ${body.applicant_message!.trim()}`);
  }
  const prior = String(current.admin_note || "").trim();
  const newNote = noteParts.length
    ? [prior, ...noteParts].filter(Boolean).join("\n")
    : prior;

  const { data, error } = await auth.context.client
    .from("opportunity_applications")
    .update({
      status,
      admin_note: newNote.slice(0, 8000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(
      "id, opportunity_id, user_id, status, payment_status, amount_paid, message, profile_completion_percent, admin_note, submitted_at, created_at, updated_at",
    )
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  let notified = false;
  if (body.notify === true) {
    notified = await maybeNotify(auth.context.client, id, status, data);
  }

  return NextResponse.json({
    ok: true,
    data,
    notified,
    from: current.status,
    status,
    source: "spojex_fallback",
  });
}

async function maybeNotify(
  client: {
    from: (t: string) => any;
  },
  applicationId: string,
  status: string,
  preloaded?: { opportunity_id: string; user_id: string },
) {
  let opportunityId = preloaded?.opportunity_id;
  let userId = preloaded?.user_id;
  if (!opportunityId || !userId) {
    const { data } = await client
      .from("opportunity_applications")
      .select("opportunity_id, user_id")
      .eq("id", applicationId)
      .maybeSingle();
    opportunityId = data?.opportunity_id;
    userId = data?.user_id;
  }
  if (!opportunityId || !userId) return false;

  const { data: opp } = await client
    .from("opportunities")
    .select("title")
    .eq("id", opportunityId)
    .maybeSingle();
  const { data: profile } = await client
    .from("users")
    .select("id, fcm_token, notifications_enabled, display_name")
    .eq("id", userId)
    .maybeSingle();

  const title = "Application update";
  const message = `Your application for “${opp?.title ?? "an opportunity"}” is now ${status.replaceAll("_", " ")}.`;
  const route = `/discover/opportunity/${opportunityId}`;

  if (!profile) return false;
  const readiness = pushReadiness(profile);
  if (readiness.canSend && profile.fcm_token) {
    await sendUserPush({
      serviceClient: client as any,
      userId: profile.id,
      token: profile.fcm_token,
      input: { title, body: message, route, type: "admin" },
    });
    return true;
  }
  await client.from("notifications").insert({
    user_id: profile.id,
    kind: "admin",
    title,
    body: message,
    payload: { type: "admin", route },
  });
  return true;
}
