import { NextResponse } from "next/server";
import type { SpojexClient as SupabaseClient } from "@/lib/api/client";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { draftToPayload, type OpportunityDraft } from "@/lib/opportunities";

const select = "*";

/** `opportunities.created_by` FKs `public.users` — admin-only auth accounts often aren't there. */
async function resolveCreatedBy(
  client: SupabaseClient,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await client.from("users").select("id").eq("id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function GET() {
  const auth = await requireAdminPermission("opportunities:read");
  if (!auth.ok) return auth.error;

  const [opsRes, appsRes, paysRes, waitRes] = await Promise.all([
    auth.context.client
      .from("opportunities")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(500),
    auth.context.client
      .from("opportunity_applications")
      .select("id, opportunity_id, status, payment_status, amount_paid")
      .limit(10000),
    auth.context.client
      .from("opportunity_application_payments")
      .select("id, opportunity_id, amount, status, paid_at, created_at")
      .eq("status", "completed")
      .limit(10000),
    auth.context.client
      .from("opportunity_waitlist")
      .select("opportunity_id")
      .limit(10000),
  ]);

  if (opsRes.error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      {
        error: hint
          ? `${opsRes.error.message}. ${hint}`
          : `${opsRes.error.message}. Apply migration 107_opportunities.sql.`,
      },
      { status: 400 },
    );
  }

  const revenue: Record<
    string,
    {
      total_applicants: number;
      paid_applicants: number;
      successful_payments: number;
      total_collected: number;
      waitlist_count: number;
    }
  > = {};

  for (const row of opsRes.data ?? []) {
    revenue[row.id] = {
      total_applicants: 0,
      paid_applicants: 0,
      successful_payments: 0,
      total_collected: 0,
      waitlist_count: 0,
    };
  }

  for (const app of appsRes.data ?? []) {
    const id = `${app.opportunity_id ?? ""}`;
    if (!id || !revenue[id]) continue;
    if (["withdrawn"].includes(`${app.status}`)) continue;
    revenue[id].total_applicants += 1;
    if (app.payment_status === "completed") {
      revenue[id].paid_applicants += 1;
    }
  }

  for (const pay of paysRes.data ?? []) {
    const id = `${pay.opportunity_id ?? ""}`;
    if (!id || !revenue[id]) continue;
    revenue[id].successful_payments += 1;
    revenue[id].total_collected += Number(pay.amount || 0);
  }

  for (const wait of waitRes.data ?? []) {
    const id = `${wait.opportunity_id ?? ""}`;
    if (!id || !revenue[id]) continue;
    revenue[id].waitlist_count += 1;
  }

  return NextResponse.json({
    data: opsRes.data ?? [],
    revenue,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("opportunities:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as Partial<OpportunityDraft> & Record<string, unknown>;
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

  const payload = draftToPayload(draft);
  if (!payload.title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (payload.fee_type === "paid" && payload.fee_amount <= 0) {
    return NextResponse.json(
      { error: "Paid opportunities need a fee greater than 0" },
      { status: 400 },
    );
  }

  const createdBy = await resolveCreatedBy(
    auth.context.client,
    auth.context.staff?.user_id ?? auth.context.user.id,
  );

  const { data, error } = await auth.context.client
    .from("opportunities")
    .insert({
      ...payload,
      required_fields: [],
      created_by: createdBy,
    })
    .select(select)
    .single();

  if (error) {
    const hint = missingServiceRoleMessage();
    const message = hint ? `${error.message}. ${hint}` : error.message;
    const rlsHint =
      /row-level security/i.test(error.message) && !hint
        ? " Opportunities writes require an authenticated admin session on the Spojex API."
        : "";
    return NextResponse.json({ error: `${message}${rlsHint}` }, { status: 400 });
  }
  return NextResponse.json({ data });
}
