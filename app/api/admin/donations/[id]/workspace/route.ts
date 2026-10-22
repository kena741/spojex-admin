import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import {
  campaignDisplayGoal,
  campaignDisplayRaised,
  campaignIsCoin,
  campaignMedia,
  campaignProgressBarPercent,
  campaignProgressLabel,
  campaignProgressPercent,
  contributionPaymentLabel,
  donationLifecyclePolicy,
  sanitizeDonorMessage,
} from "@/lib/donations";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("donations:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/donations/${id}/workspace`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      if (res.status !== 404) {
        const body = payload as { message?: string; detail?: string; error?: string };
        return NextResponse.json(
          {
            error:
              body.message ||
              body.detail ||
              (body.error === "not_found" ? "Campaign not found" : body.error) ||
              "Failed to load workspace",
          },
          { status: res.status },
        );
      }
    } catch {
      // local fallback
    }
  }

  const { data: campaign, error } = await auth.context.client
    .from("donation_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { data: contribs } = await auth.context.client
    .from("donation_contributions")
    .select("*, users:user_id(id, display_name)")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (contribs ?? []) as Record<string, unknown>[];
  const completed = rows.filter((r) =>
    ["completed", "paid", "success", "verified"].includes(String(r.status || "").toLowerCase()),
  );
  const uniqueDonors = new Set(
    completed.map((r) => r.user_id).filter(Boolean).map(String),
  ).size;

  let beneficiaryName: string | null = null;
  let beneficiaryOrg: { id?: string; name?: string; is_platform?: boolean } | null = null;
  if (campaign.beneficiary_user_id) {
    const { data: user } = await auth.context.client
      .from("users")
      .select("id, display_name, email")
      .eq("id", campaign.beneficiary_user_id)
      .maybeSingle();
    beneficiaryName = user?.display_name ?? null;
    const { data: org } = await auth.context.client
      .from("organizations")
      .select("id, name, is_platform")
      .eq("user_id", campaign.beneficiary_user_id)
      .order("is_platform", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (org) beneficiaryOrg = org;
  }

  const media = campaignMedia(campaign);
  const coin = campaignIsCoin(campaign);
  const { count: contribCount } = await auth.context.client
    .from("donation_contributions")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id);

  const recent = rows.map((row) => {
    const anonymous = Boolean(row.is_anonymous);
    const src = contributionPaymentLabel(row as never);
    return {
      ...row,
      donor_display_name: anonymous
        ? "Anonymous"
        : (row.users as { display_name?: string } | null)?.display_name || "Donor",
      user_id: anonymous ? null : row.user_id,
      message: sanitizeDonorMessage(String(row.message || "")),
      payment_source: src,
      transaction_reference: src.reference,
      finance_href: `/admin/finance/transactions?module=donations&q=${row.id}`,
    };
  });

  const alerts: string[] = [];
  if (!campaign.beneficiary_user_id) {
    alerts.push("No beneficiary set — contributions may credit the platform default.");
  }
  if ((contribCount ?? 0) > 0) {
    alerts.push(`Asset is locked (${coin ? "coin" : "ETB"} campaign with contributions).`);
  }
  if (campaign.status === "paused") {
    alerts.push("Campaign is paused — new contributions are blocked.");
  }

  return NextResponse.json({
    campaign: {
      ...campaign,
      beneficiary_display_name: beneficiaryName,
    },
    media,
    asset: coin ? "coin" : "etb",
    progress: {
      raised: String(campaignDisplayRaised(campaign)),
      goal: String(campaignDisplayGoal(campaign)),
      percent: campaignProgressPercent(campaign),
      bar_percent: campaignProgressBarPercent(campaign),
      label: campaignProgressLabel(campaign),
      note: "Progress uses completed contributions only; refunds/reversals are excluded from raised counters.",
    },
    attribution: {
      public_beneficiary_user_id: campaign.beneficiary_user_id,
      public_beneficiary_name: beneficiaryName,
      public_beneficiary_org: beneficiaryOrg,
      credited_recipient_note:
        "Each contribution stores credited_user_id at completion. Changing the campaign beneficiary does not move historical funds.",
      managing_organization: beneficiaryOrg,
      redeem_authorized:
        "Credited user wallet (coin) or platform payout rules (ETB) — see Finance.",
    },
    aggregates: {
      completed_count: completed.length,
      unique_donors: uniqueDonors,
    },
    recent_contributions: recent,
    activity: [],
    alerts,
    lifecycle_policy: donationLifecyclePolicy,
    disbursements: {
      supported: false,
      message:
        "Campaign disbursement is not implemented. Wallet credit on coin gifts is not a campaign payout. Use Finance for ledger visibility.",
    },
    contribution_count: contribCount ?? 0,
    asset_locked: (contribCount ?? 0) > 0,
    source: "local",
  });
}
