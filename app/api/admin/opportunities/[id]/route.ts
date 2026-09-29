import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { notifyOpportunityWaitlist } from "@/lib/opportunity-waitlist-notify";
import { draftToPayload, type OpportunityDraft } from "@/lib/opportunities";

const select = "*";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("opportunities:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const [oppRes, appsRes, paysRes, waitRes] = await Promise.all([
    auth.context.client.from("opportunities").select(select).eq("id", id).maybeSingle(),
    auth.context.client
      .from("opportunity_applications")
      .select(
        "id, opportunity_id, user_id, message, profile_completion_percent, status, payment_status, amount_paid, currency, provider_ref, extra_answers, admin_note, submitted_at, created_at, users:user_id(id, display_name, avatar_url, role, username)",
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
      .select("id, user_id, notified_at, created_at, users:user_id(id, display_name, avatar_url)")
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

  const paidStatuses = new Set(["completed"]);
  const apps = appsRes.data ?? [];
  const pays = paysRes.data ?? [];
  const waitlist = waitRes.data ?? [];

  const totalApplicants = apps.filter((a) => a.status !== "withdrawn").length;
  const paidApplicants = apps.filter((a) => a.payment_status === "completed").length;
  const successfulPayments = pays.filter((p) => paidStatuses.has(`${p.status}`)).length;
  const totalCollected = pays
    .filter((p) => paidStatuses.has(`${p.status}`))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return NextResponse.json({
    data: oppRes.data,
    applications: apps,
    payments: pays,
    waitlist,
    revenue: {
      total_applicants: totalApplicants,
      paid_applicants: paidApplicants,
      successful_payments: successfulPayments,
      total_collected: totalCollected,
      waitlist_count: waitlist.length,
    },
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
  } else {
    if (typeof body.status === "string") patch.status = body.status;
    if (typeof body.is_published === "boolean") patch.is_published = body.is_published;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
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

  return NextResponse.json({ data, notify });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("opportunities:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { error } = await auth.context.client.from("opportunities").delete().eq("id", id);
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
