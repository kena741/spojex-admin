export type DonationStatus = "draft" | "active" | "paused" | "closed";

export const donationStatuses: { id: DonationStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "closed", label: "Closed" },
];

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
}) {
  const code = (campaign.currency || "").toUpperCase();
  return code === "COIN" || code === "COINS" || (campaign.goal_coins ?? 0) > 0 || (campaign.raised_coins ?? 0) > 0;
}

export function campaignDisplayRaised(campaign: {
  currency?: string | null;
  goal_coins?: number | null;
  raised_coins?: number | null;
  raised_amount?: number | null;
}) {
  if (!campaignIsCoin(campaign)) return Number(campaign.raised_amount ?? 0);
  const raisedCoins = Number(campaign.raised_coins ?? 0);
  return raisedCoins > 0 ? raisedCoins : Number(campaign.raised_amount ?? 0);
}

export function campaignDisplayGoal(campaign: {
  currency?: string | null;
  goal_coins?: number | null;
  raised_coins?: number | null;
  goal_amount?: number | null;
}) {
  if (!campaignIsCoin(campaign)) return Number(campaign.goal_amount ?? 0);
  const goalCoins = Number(campaign.goal_coins ?? 0);
  return goalCoins > 0 ? goalCoins : Number(campaign.goal_amount ?? 0);
}

/** 0–100. Non-zero raised amounts under 1% stay visible as a fraction. */
export function campaignProgressPercent(campaign: {
  currency?: string | null;
  goal_coins?: number | null;
  raised_coins?: number | null;
  goal_amount?: number | null;
  raised_amount?: number | null;
}) {
  const goal = campaignDisplayGoal(campaign);
  const raised = campaignDisplayRaised(campaign);
  if (!(goal > 0) || !(raised > 0)) return 0;
  return Math.min(100, (raised / goal) * 100);
}

/** Label for raised/goal UI (`12%`, `<1%`, …). */
export function campaignProgressLabel(campaign: {
  currency?: string | null;
  goal_coins?: number | null;
  raised_coins?: number | null;
  goal_amount?: number | null;
  raised_amount?: number | null;
}) {
  const raised = campaignDisplayRaised(campaign);
  const pct = campaignProgressPercent(campaign);
  if (raised > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}
