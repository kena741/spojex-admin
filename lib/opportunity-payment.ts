/** Display labels for opportunity application payments — never expose raw "none". */

export function opportunityPaymentLabel(
  feeType: string | null | undefined,
  paymentStatus: string | null | undefined,
): string {
  if (!feeType || feeType === "free") return "Not required — free opportunity";
  const s = String(paymentStatus || "").trim().toLowerCase();
  if (!s || s === "none" || s === "null") return "Awaiting payment";
  if (["completed", "paid", "success", "verified"].includes(s)) return "Verified";
  if (["pending", "processing", "initiated"].includes(s)) return "Awaiting payment";
  if (s === "failed") return "Failed";
  if (s === "refunded") return "Refunded";
  if (s === "partial_refund") return "Partially refunded";
  if (s === "cancelled" || s === "canceled") return "Cancelled";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const APPLICATION_TRANSITIONS: Record<string, string[]> = {
  draft: ["withdrawn"],
  submitted: ["under_review", "shortlisted", "accepted", "rejected", "withdrawn"],
  under_review: ["shortlisted", "accepted", "rejected", "withdrawn"],
  shortlisted: ["accepted", "rejected", "withdrawn"],
  accepted: ["withdrawn"],
  rejected: [],
  withdrawn: [],
};

export function applicationActionLabel(status: string) {
  switch (status) {
    case "under_review":
      return "Start review";
    case "shortlisted":
      return "Shortlist";
    case "accepted":
      return "Accept";
    case "rejected":
      return "Reject";
    case "withdrawn":
      return "Withdraw (admin)";
    default:
      return status.replace(/_/g, " ");
  }
}

export function reasonRequiredFor(status: string) {
  return status === "rejected" || status === "withdrawn";
}
