import { NextResponse } from "next/server";
import type { SpojexClient } from "@/lib/api/client";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
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

async function resolveCreatedBy(
  client: SpojexClient,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await client.from("users").select("id").eq("id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function GET(request: Request) {
  const auth = await requireAdminPermission("opportunities:read");
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const proxied = await proxyPython(`/api/v1/admin/opportunities?${url.searchParams}`);
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }

  // Fallback: previous client aggregation (bounded)
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
    auth.context.client.from("opportunity_waitlist").select("opportunity_id").limit(10000),
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
    if (app.payment_status === "completed") revenue[id].paid_applicants += 1;
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

  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const status = url.searchParams.get("status") || "all";
  const published = url.searchParams.get("published") || "all";
  const category = (url.searchParams.get("category") || "").trim().toLowerCase();
  const organizer = (url.searchParams.get("organizer") || "").trim().toLowerCase();
  const country = (url.searchParams.get("country") || "").trim().toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") || 40) || 40));

  type OppListRow = {
    id: string;
    title?: string | null;
    category?: string | null;
    organizer?: string | null;
    location?: string | null;
    country?: string | null;
    status?: string | null;
    is_published?: boolean | null;
    applicant_count: number;
    waitlist_count: number;
    verified_collections: string;
    href_applications: string;
    href_waitlist: string;
    [key: string]: unknown;
  };

  let rows: OppListRow[] = (opsRes.data ?? []).map((row: Record<string, unknown> & { id: string }) => ({
    ...row,
    applicant_count: revenue[row.id]?.total_applicants ?? 0,
    waitlist_count: revenue[row.id]?.waitlist_count ?? 0,
    verified_collections: String(revenue[row.id]?.total_collected?.toFixed(2) ?? "0.00"),
    href_applications: `/admin/opportunities/${row.id}?tab=applications`,
    href_waitlist: `/admin/opportunities/${row.id}?tab=waitlist`,
  }));

  rows = rows.filter((row: OppListRow) => {
    if (status !== "all" && row.status !== status) return false;
    if (published === "yes" && !row.is_published) return false;
    if (published === "no" && row.is_published) return false;
    if (category && !String(row.category || "").toLowerCase().includes(category)) return false;
    if (organizer && !String(row.organizer || "").toLowerCase().includes(organizer)) return false;
    if (country && !String(row.country || "").toLowerCase().includes(country)) return false;
    if (q) {
      const hay = [row.title, row.category, row.organizer, row.location, row.country, row.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const verifiedTotal = Object.values(revenue).reduce(
    (s: number, r: { total_collected: number }) => s + r.total_collected,
    0,
  );
  const applicantsTotal = Object.values(revenue).reduce(
    (s: number, r: { total_applicants: number }) => s + r.total_applicants,
    0,
  );
  const waitlistTotal = Object.values(revenue).reduce(
    (s: number, r: { waitlist_count: number }) => s + r.waitlist_count,
    0,
  );

  return NextResponse.json({
    data: pageRows,
    total,
    page,
    page_size: pageSize,
    revenue,
    source: "admin_local_fallback",
    summary_scope: {
      global: {
        opportunities: (opsRes.data ?? []).length,
        applicants: applicantsTotal,
        waitlist: waitlistTotal,
        verified_collections: verifiedTotal.toFixed(2),
        currency: "ETB",
        label: "All opportunities (not filter-scoped)",
      },
      filtered: {
        opportunities: total,
        applicants: pageRows.reduce((s: number, r: OppListRow) => s + (r.applicant_count || 0), 0),
        waitlist: pageRows.reduce((s: number, r: OppListRow) => s + (r.waitlist_count || 0), 0),
        verified_collections: pageRows
          .reduce((s: number, r: OppListRow) => s + Number(r.verified_collections || 0), 0)
          .toFixed(2),
        currency: "ETB",
        label: "Matching current filters",
      },
    },
    definitions: {
      waitlist:
        "Interest list before applications open. Not a capacity overflow queue.",
      verified_collections:
        "Sum of verified application-fee payments. Not platform commission.",
    },
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
    eligible_roles: Array.isArray(body.eligible_roles) ? body.eligible_roles.map(String) : [],
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
  if (
    payload.external_link &&
    !payload.external_link.startsWith("http://") &&
    !payload.external_link.startsWith("https://")
  ) {
    return NextResponse.json(
      { error: "External URL must start with http:// or https://" },
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
      cover_image_url: toBackendMediaUrl(payload.cover_image_url),
      required_fields: [],
      created_by: createdBy,
    })
    .select(select)
    .single();

  if (error) {
    const hint = missingServiceRoleMessage();
    const message = hint ? `${error.message}. ${hint}` : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ data });
}
