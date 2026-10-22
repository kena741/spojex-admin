export type DonationStatus = "draft" | "active" | "paused" | "closed";

export const donationStatuses: { id: DonationStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "closed", label: "Closed" },
];

export const donationLifecyclePolicy = {
  draft: "Not publicly listed; contributions rejected.",
  active: "Accepts coin gifts and ETB checkouts.",
  paused: "Listed but new contributions blocked; late ETB confirmations still settle.",
  closed: "No new contributions; history preserved. Reopen via activate with reason.",
  target_auto_close: false,
  over_100_percent:
    "Allowed — progress bar caps visually at 100% while totals and labels show overflow.",
  asset_lock: "Currency/asset cannot change after any contribution exists.",
  disbursements: "Not implemented — do not infer payout from wallet credit.",
} as const;

export function donationStatusLabel(status?: string | null) {
  return donationStatuses.find((item) => item.id === status)?.label ?? status ?? "—";
}

export function slugifyDonation(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatDonationAmount(amount: number | null | undefined, currency = "ETB") {
  if (amount == null) return "—";
  const code = (currency || "ETB").toUpperCase();
  if (code === "COIN" || code === "COINS") {
    return `${Number(amount).toLocaleString()} coins`;
  }
  return `${Number(amount).toLocaleString()} ${currency}`;
}

export function campaignIsCoin(campaign: {
  currency?: string | null;
  goal_coins?: number | null;
  raised_coins?: number | null;
  asset?: string | null;
}) {
  if (campaign.asset === "coin") return true;
  const code = (campaign.currency || "").toUpperCase();
  return (
    code === "COIN" ||
    code === "COINS" ||
    (campaign.goal_coins ?? 0) > 0 ||
    (campaign.raised_coins ?? 0) > 0
  );
}

export function campaignAssetLabel(campaign: {
  currency?: string | null;
  goal_coins?: number | null;
  raised_coins?: number | null;
  asset?: string | null;
  asset_label?: string | null;
}) {
  if (campaign.asset_label) return campaign.asset_label;
  return campaignIsCoin(campaign) ? "Coins" : "ETB";
}

export function campaignDisplayRaised(campaign: {
  currency?: string | null;
  goal_coins?: number | null;
  raised_coins?: number | null;
  raised_amount?: number | null;
  raised_display?: number | string | null;
}) {
  if (campaign.raised_display != null && campaign.raised_display !== "") {
    return Number(campaign.raised_display);
  }
  if (!campaignIsCoin(campaign)) return Number(campaign.raised_amount ?? 0);
  const raisedCoins = Number(campaign.raised_coins ?? 0);
  return raisedCoins > 0 ? raisedCoins : Number(campaign.raised_amount ?? 0);
}

export function campaignDisplayGoal(campaign: {
  currency?: string | null;
  goal_coins?: number | null;
  raised_coins?: number | null;
  goal_amount?: number | null;
  goal_display?: number | string | null;
}) {
  if (campaign.goal_display != null && campaign.goal_display !== "") {
    return Number(campaign.goal_display);
  }
  if (!campaignIsCoin(campaign)) return Number(campaign.goal_amount ?? 0);
  const goalCoins = Number(campaign.goal_coins ?? 0);
  return goalCoins > 0 ? goalCoins : Number(campaign.goal_amount ?? 0);
}

/** Raw progress; may exceed 100 when raised > goal. */
export function campaignProgressPercent(campaign: {
  currency?: string | null;
  goal_coins?: number | null;
  raised_coins?: number | null;
  goal_amount?: number | null;
  raised_amount?: number | null;
  raised_display?: number | string | null;
  goal_display?: number | string | null;
  progress_percent?: number | null;
}) {
  if (typeof campaign.progress_percent === "number") return campaign.progress_percent;
  const goal = campaignDisplayGoal(campaign);
  const raised = campaignDisplayRaised(campaign);
  if (!(goal > 0) || !(raised > 0)) return 0;
  return (raised / goal) * 100;
}

/** Visual bar width 0–100. */
export function campaignProgressBarPercent(campaign: Parameters<typeof campaignProgressPercent>[0]) {
  return Math.min(100, campaignProgressPercent(campaign));
}

/** Label for raised/goal UI (`12%`, `<1%`, `120%`, …). */
export function campaignProgressLabel(campaign: Parameters<typeof campaignProgressPercent>[0] & {
  progress_label?: string | null;
}) {
  if (campaign.progress_label) return campaign.progress_label;
  const raised = campaignDisplayRaised(campaign);
  const pct = campaignProgressPercent(campaign);
  if (raised > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

export function campaignMedia(campaign: {
  cover_url?: string | null;
  image_url?: string | null;
  media?: {
    display_url?: string;
    cover_url?: string | null;
    thumbnail_url?: string | null;
    using_thumbnail_as_cover?: boolean;
    note?: string;
  } | null;
}) {
  if (campaign.media?.display_url != null) {
    return {
      display_url: campaign.media.display_url || "",
      cover_url: campaign.media.cover_url || "",
      thumbnail_url: campaign.media.thumbnail_url || "",
      using_thumbnail_as_cover: Boolean(campaign.media.using_thumbnail_as_cover),
      note:
        campaign.media.note ||
        (campaign.media.using_thumbnail_as_cover
          ? "Mobile hero uses the thumbnail because cover is empty."
          : "Cover is set."),
    };
  }
  const cover = String(campaign.cover_url || "").trim();
  const thumb = String(campaign.image_url || "").trim();
  return {
    display_url: cover || thumb,
    cover_url: cover,
    thumbnail_url: thumb,
    using_thumbnail_as_cover: Boolean(!cover && thumb),
    note: !cover && thumb
      ? "Mobile hero uses the thumbnail because cover is empty."
      : cover
        ? "Cover is set; thumbnail is optional."
        : "No campaign image.",
  };
}

export function sanitizeDonorMessage(message?: string | null, max = 500) {
  return String(message || "")
    .replace(/[<>]/g, "")
    .slice(0, max);
}

export function contributionPaymentLabel(row: {
  currency?: string | null;
  provider_ref?: string | null;
  payment_source?: { label?: string; method?: string; reference?: string } | null;
}) {
  if (row.payment_source?.label) return row.payment_source;
  const code = (row.currency || "").toUpperCase();
  const ref = String(row.provider_ref || "").trim();
  if (code === "COIN" || code === "COINS" || ref.startsWith("coin:")) {
    return { method: "coin_wallet", label: "Coin wallet", reference: ref || "—" };
  }
  if (ref) {
    return { method: "chapa", label: "Chapa (ETB)", reference: ref };
  }
  return { method: "unknown", label: "Payment", reference: "—" };
}
