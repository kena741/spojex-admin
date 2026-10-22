import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { notifyOpportunityWaitlist } from "@/lib/opportunity-waitlist-notify";
import { draftToPayload, type OpportunityDraft } from "@/lib/opportunities";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { requestAccessToken } from "@/lib/spojex/server";

const select = "*";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("opportunities:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const proxied = await proxyPython(`/api/v1/admin/opportunities/${id}`);
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }

  const appCols =
    "id, opportunity_id, user_id, message, profile_completion_percent, status, payment_status, amount_paid, currency, provider_ref, extra_answers, admin_note, submitted_at, created_at, updated_at";
  const waitCols = "id, user_id, notified_at, created_at";

  const [oppRes, appsRes, paysRes, waitRes] = await Promise.all([
    auth.context.client.from("opportunities").select(select).eq("id", id).maybeSingle(),
    auth.context.client
      .from("opportunity_applications")
      .select(
        `${appCols}, users:user_id(id, display_name, avatar_url, role, username)`,
      )
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false })
      .limit(2000),
    auth.context.client
      .from("opportunity_application_payments")
      .select("id, application_id, amount, currency, status, provider_ref, paid_at, created_at")
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false })
      .limit(2000),
    auth.context.client
      .from("opportunity_waitlist")
      .select(`${waitCols}, users:user_id(id, display_name, avatar_url)`)
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  if (oppRes.error) {
    return NextResponse.json({ error: oppRes.error.message }, { status: 400 });
  }
  if (!oppRes.data) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  // Embeds can fail on the Spojex REST shim - fall back to plain rows + user lookup.
  let apps = (appsRes.data ?? []) as Array<Record<string, any>>;
  if (appsRes.error) {
    const plain = await auth.context.client
      .from("opportunity_applications")
      .select(appCols)
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (!plain.error) apps = (plain.data ?? []) as Array<Record<string, any>>;
  }

  let waitlist = (waitRes.data ?? []) as Array<Record<string, any>>;
  if (waitRes.error) {
    const plain = await auth.context.client
      .from("opportunity_waitlist")
      .select(waitCols)
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (!plain.error) waitlist = (plain.data ?? []) as Array<Record<string, any>>;
  }

  const userIds = [
    ...new Set(
      [...apps, ...waitlist]
        .map((row) => String(row.user_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (userIds.length > 0) {
    const { data: users } = await auth.context.client
      .from("users")
      .select("id, display_name, avatar_url, role, username")
      .in("id", userIds);
    const byId = new Map(
      (users ?? []).map((u: any) => [String(u.id), u] as const),
    );
    apps = apps.map((row) => ({
      ...row,
      users: row.users ?? byId.get(String(row.user_id)) ?? null,
    }));
    waitlist = waitlist.map((row) => ({
      ...row,
      users: row.users ?? byId.get(String(row.user_id)) ?? null,
    }));
  }

  const paidStatuses = new Set(["completed", "paid", "success", "verified"]);
  const pays = (paysRes.data ?? []).map((p: any) => ({
    ...p,
    label:
      p.status && paidStatuses.has(String(p.status).toLowerCase())
        ? "Verified"
        : String(p.status || "").toLowerCase() === "refunded"
          ? "Refunded"
          : "Awaiting payment",
    finance_tx_id: `opportunity_payment:${p.id}`,
    finance_href: `/admin/finance/transactions?module=opportunity&id=opportunity_payment:${p.id}`,
  }));

  const feeType = String(oppRes.data.fee_type || "free");
  const transitions: Record<string, string[]> = {
    draft: ["withdrawn"],
    submitted: ["under_review", "shortlisted", "accepted", "rejected", "withdrawn"],
    under_review: ["shortlisted", "accepted", "rejected", "withdrawn"],
    shortlisted: ["accepted", "rejected", "withdrawn"],
    accepted: ["withdrawn"],
    rejected: [],
    withdrawn: [],
  };

  apps = apps.map((row: any) => {
    const extra =
      row.extra_answers && typeof row.extra_answers === "object" ? row.extra_answers : {};
    const feeSnap = extra._fee_snapshot || null;
    const snapFee = feeSnap?.fee_type || feeType;
    const payStatus = String(row.payment_status || "");
    let payment_label = "Not required - free opportunity";
    if (snapFee === "paid" || feeType === "paid") {
      const s = payStatus.toLowerCase();
      if (!s || s === "none") payment_label = "Awaiting payment";
      else if (paidStatuses.has(s)) payment_label = "Verified";
      else if (s === "refunded") payment_label = "Refunded";
      else payment_label = payStatus;
    }
    return {
      ...row,
      payment_label,
      fee_snapshot: feeSnap,
      terms_snapshot: extra._terms_snapshot || null,
      profile_snapshot: extra._profile_snapshot || null,
      decision_history: Array.isArray(extra._decisions) ? extra._decisions : [],
      applicant_messages: Array.isArray(extra._applicant_messages)
        ? extra._applicant_messages
        : [],
      allowed_transitions: transitions[String(row.status || "").toLowerCase()] || [],
      reference: `APP-${String(row.id).slice(0, 8).toUpperCase()}`,
      people_href: row.user_id ? `/admin/people/${row.user_id}` : null,
    };
  });

  const appsByUser = new Map(
    apps.map((a: any) => [String(a.user_id), a] as const),
  );
  waitlist = waitlist.map((w: any) => {
    const related = appsByUser.get(String(w.user_id));
    return {
      ...w,
      state: w.notified_at ? "notified" : "waiting",
      state_label: w.notified_at
        ? "Notified when applications opened"
        : "Waiting for applications to open",
      people_href: w.user_id ? `/admin/people/${w.user_id}` : null,
      related_application_id: related?.id ?? null,
      related_application_status: related?.status ?? null,
    };
  });

  const totalApplicants = apps.filter((a: any) => a.status !== "withdrawn").length;
  const paidApplicants = apps.filter((a: any) =>
    paidStatuses.has(String(a.payment_status || "").toLowerCase()),
  ).length;
  const successfulPayments = pays.filter((p: any) =>
    paidStatuses.has(String(p.status || "").toLowerCase()),
  ).length;
  const totalCollected = pays
    .filter((p: any) => paidStatuses.has(String(p.status || "").toLowerCase()))
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const reviewQueue = apps.filter((a: any) =>
    ["submitted", "under_review", "shortlisted"].includes(String(a.status)),
  ).length;
  const maxApp = oppRes.data.max_applicants;

  return NextResponse.json({
    data: oppRes.data,
    applications: apps,
    payments: pays,
    waitlist,
    overview: {
      timezone: "Africa/Addis_Ababa",
      applicant_count: totalApplicants,
      waitlist_count: waitlist.length,
      review_queue: reviewQueue,
      verified_collections: String(totalCollected),
      currency: "ETB",
      capacity: maxApp,
      capacity_remaining:
        maxApp != null ? Math.max(0, Number(maxApp) - totalApplicants) : null,
      scheduling_issues: [],
      config_missing: [],
      applications_open_at: oppRes.data.application_opens_at,
      application_deadline: oppRes.data.application_deadline,
      event_start: oppRes.data.start_date,
      event_end: oppRes.data.end_date,
      waitlist_definition:
        "Interest before applications open. Not capacity overflow. Does not auto-create applications.",
      terms_version: Number((oppRes.data as { terms_version?: number }).terms_version || 1),
      schedule_timezone_note:
        "Timestamps stored in UTC; admin display uses Africa/Addis_Ababa.",
    },
    revenue: {
      total_applicants: totalApplicants,
      paid_applicants: paidApplicants,
      successful_payments: successfulPayments,
      total_collected: totalCollected,
      waitlist_count: waitlist.length,
      label: "Verified application-fee collections (not platform commission)",
    },
    audit: [],
    last_schedule_run: null,
    source: "admin_local_fallback",
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("opportunities:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const body = (await request.json()) as Record<string, unknown>;
  const previous = await auth.context.client
    .from("opportunities")
    .select("status, is_published")
    .eq("id", id)
    .maybeSingle();

  // Full draft replace when title present; otherwise sparse patch (status actions).
  let patch: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const draft = {
      title: String(body.title ?? ""),
      cover_image_url: String(body.cover_image_url ?? ""),
      description: String(body.description ?? ""),
      category: String(body.category ?? "General"),
      organizer: String(body.organizer ?? ""),
      location: String(body.location ?? ""),
      country: String(body.country ?? ""),
      start_date: String(body.start_date ?? ""),
      end_date: String(body.end_date ?? ""),
      application_opens_at: String(body.application_opens_at ?? ""),
      application_deadline: String(body.application_deadline ?? ""),
      status: (body.status as OpportunityDraft["status"]) || "coming_soon",
      is_published: body.is_published === true,
      fee_type: (body.fee_type as OpportunityDraft["fee_type"]) || "free",
      fee_amount: String(body.fee_amount ?? "0"),
      min_profile_completion: String(body.min_profile_completion ?? "60"),
      max_applicants: String(body.max_applicants ?? ""),
      eligibility_requirements: String(body.eligibility_requirements ?? ""),
      required_documents: String(body.required_documents ?? ""),
      eligible_roles: Array.isArray(body.eligible_roles)
        ? body.eligible_roles.map(String)
        : [],
      external_link: String(body.external_link ?? ""),
      additional_terms: String(body.additional_terms ?? ""),
      allow_multiple_applications: body.allow_multiple_applications === true,
    } satisfies OpportunityDraft;
    patch = draftToPayload(draft);
    if (!patch.title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (typeof patch.cover_image_url === "string") {
      patch.cover_image_url = toBackendMediaUrl(patch.cover_image_url);
    }
  } else {
    if (typeof body.status === "string") patch.status = body.status;
    if (typeof body.is_published === "boolean") patch.is_published = body.is_published;
    if (typeof body.cover_image_url === "string") {
      patch.cover_image_url = toBackendMediaUrl(body.cover_image_url);
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Client-side ordering checks before write (mirrors Python validator).
  const opens = String(patch.application_opens_at || "");
  const deadline = String(patch.application_deadline || "");
  if (opens && deadline && opens > deadline) {
    return NextResponse.json(
      { error: "Applications open time must be before the deadline" },
      { status: 400 },
    );
  }
  if (patch.fee_type === "paid" && Number(patch.fee_amount || 0) <= 0) {
    return NextResponse.json(
      { error: "Paid opportunities need a fee greater than 0" },
      { status: 400 },
    );
  }

  const proxied = await proxyPython(`/api/v1/admin/opportunities/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...patch,
      expected_updated_at: body.expected_updated_at || null,
    }),
  });
  if (proxied?.res.ok) {
    const payload = proxied.payload as { data?: Record<string, unknown> };
    const data = payload.data;
    let notify: Awaited<ReturnType<typeof notifyOpportunityWaitlist>> | null = null;
    if (
      data &&
      (body.notify_waitlist === true ||
        (data.is_published === true &&
          data.status === "open" &&
          (previous.data?.status !== "open" || previous.data?.is_published !== true)))
    ) {
      notify = await notifyOpportunityWaitlist(auth.context.client, id);
    }
    return NextResponse.json({ ...payload, notify, source: "python" });
  }
  if (proxied && proxied.res.status >= 400 && proxied.res.status !== 404) {
    return NextResponse.json(
      {
        error:
          (proxied.payload as { error?: string; message?: string }).error ||
          (proxied.payload as { message?: string }).message ||
          "Update failed",
      },
      { status: proxied.res.status },
    );
  }

  const { data, error } = await auth.context.client
    .from("opportunities")
    .update(patch)
    .eq("id", id)
    .select(select)
    .maybeSingle();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  const openedNow =
    data.is_published &&
    data.status === "open" &&
    (previous.data?.status !== "open" || previous.data?.is_published !== true);

  let notify: Awaited<ReturnType<typeof notifyOpportunityWaitlist>> | null = null;
  if (openedNow || body.notify_waitlist === true) {
    notify = await notifyOpportunityWaitlist(auth.context.client, id);
  }

  return NextResponse.json({ data, notify, source: "admin_local_fallback" });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("opportunities:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  const proxied = await proxyPython(`/api/v1/admin/opportunities/${id}/archive`, {
    method: "POST",
    body: JSON.stringify({ force }),
  });
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }

  // Soft-archive locally: unpublish + close when dependencies exist
  const [{ count: appCount }, { count: payCount }] = await Promise.all([
    auth.context.client
      .from("opportunity_applications")
      .select("id", { count: "exact", head: true })
      .eq("opportunity_id", id),
    auth.context.client
      .from("opportunity_application_payments")
      .select("id", { count: "exact", head: true })
      .eq("opportunity_id", id),
  ]);

  if ((appCount ?? 0) > 0 || (payCount ?? 0) > 0) {
    const { data, error } = await auth.context.client
      .from("opportunities")
      .update({
        is_published: false,
        status: "closed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      archived: true,
      deleted: false,
      data,
      dependencies: { applications: appCount ?? 0, payments: payCount ?? 0 },
      message: "Archived (unpublished + closed). Applications and payments preserved.",
    });
  }

  await auth.context.client.from("opportunity_waitlist").delete().eq("opportunity_id", id);
  const { error } = await auth.context.client.from("opportunities").delete().eq("id", id);
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, archived: false, deleted: true });
}
