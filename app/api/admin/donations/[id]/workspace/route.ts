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
    .select("*, users:user_id(id, display_name), credited:credited_user_id(id, display_name, email)")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

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
    alerts.push("No beneficiary set - contributions may credit the platform default.");
  }
  if ((contribCount ?? 0) > 0) {
    alerts.push(`Asset is locked (${coin ? "coin" : "ETB"} campaign with contributions).`);
  }
  if (campaign.status === "paused") {
    alerts.push("Campaign is paused - new contributions are blocked.");
  }

  const recipientMap = new Map<
    string,
    {
      credited_user_id: string | null;
      recipient_name: string;
      currency: string;
      contribution_count: number;
      total_amount: number;
    }
  >();
  for (const row of completed) {
    const credited = row.credited_user_id ? String(row.credited_user_id) : null;
    const currency = String(row.currency || (coin ? "COIN" : "ETB")).toUpperCase();
    const key = `${credited || "none"}:${currency}`;
    const prev = recipientMap.get(key);
    const amount = Number(row.amount || 0);
    if (prev) {
      prev.contribution_count += 1;
      prev.total_amount += amount;
    } else {
      const creditedUser = row.credited as
        | { display_name?: string; email?: string }
        | null
        | undefined;
      recipientMap.set(key, {
        credited_user_id: credited,
        recipient_name: credited
          ? creditedUser?.display_name || creditedUser?.email || beneficiaryName || credited
          : "Unassigned",
        currency,
        contribution_count: 1,
        total_amount: amount,
      });
    }
  }
  const recipients = [...recipientMap.values()]
    .sort((a, b) => b.total_amount - a.total_amount)
    .map((r) => ({
      ...r,
      total_amount: r.total_amount.toFixed(2),
      finance_href: `/admin/finance/transactions?module=donations&q=${r.credited_user_id || id}`,
    }));
  let totalEtb = 0;
  let totalCoins = 0;
  for (const r of recipients) {
    if (r.currency === "COIN" || r.currency === "COINS") totalCoins += Number(r.total_amount);
    else totalEtb += Number(r.total_amount);
  }

  const supporterMap = new Map<
    string,
    {
      supporter_user_id: string | null;
      supporter_name: string;
      currency: string;
      total_amount: number;
    }
  >();
  for (const row of completed) {
    const anonymous = Boolean(row.is_anonymous);
    const userId = anonymous || !row.user_id ? null : String(row.user_id);
    const currency = String(row.currency || (coin ? "COIN" : "ETB")).toUpperCase();
    const donor = row.users as { display_name?: string } | null | undefined;
    const name = anonymous
      ? "Anonymous"
      : donor?.display_name || (userId ? userId : "Donor");
    const key = `${anonymous ? "anon" : userId || "unknown"}:${currency}`;
    const prev = supporterMap.get(key);
    const amount = Number(row.amount || 0);
    if (prev) prev.total_amount += amount;
    else {
      supporterMap.set(key, {
        supporter_user_id: userId,
        supporter_name: name,
        currency,
        total_amount: amount,
      });
    }
  }
  const supporters = [...supporterMap.values()]
    .sort((a, b) => b.total_amount - a.total_amount)
    .map((r) => ({
      ...r,
      amount: r.total_amount.toFixed(2),
      total_amount: r.total_amount.toFixed(2),
    }));

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
      redeem_authorized: "Credited user coin wallet — see Finance for ledger detail.",
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
      supported: true,
      mode: "contribution_credit",
      campaign_beneficiary_user_id: campaign.beneficiary_user_id,
      campaign_beneficiary_name: beneficiaryName,
      totals: {
        etb: totalEtb.toFixed(2),
        coins: totalCoins.toFixed(2),
        recipient_count: new Set(recipients.map((r) => r.credited_user_id).filter(Boolean)).size,
        supporter_count: supporters.length,
      },
      recipients,
      supporters,
      finance_href: `/admin/finance/transactions?module=donations&q=${id}`,
    },
    contribution_count: contribCount ?? 0,
    asset_locked: (contribCount ?? 0) > 0,
    source: "local",
  });
}
