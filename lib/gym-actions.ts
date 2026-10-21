import type { GymRow } from "@/lib/gyms";

export type GymActionId =
  | "approve_listing"
  | "mark_under_review"
  | "suspend"
  | "reactivate"
  | "feature_approve"
  | "feature_reject"
  | "feature_toggle"
  | "edit";

export type GymAction = {
  id: GymActionId;
  label: string;
  tone?: "default" | "success" | "danger";
  needsReason?: boolean;
};

/**
 * Allowed gym admin actions for the current listing / verification / feature state.
 * Listing, verification, and featuring are separate axes — do not show Approve for
 * an already active+verified gym.
 */
export function gymAllowedActions(row: GymRow): GymAction[] {
  const actions: GymAction[] = [{ id: "edit", label: "Edit profile" }];

  const listing = (row.status || "").toLowerCase();
  const verification = (row.verification_status || "").toLowerCase();
  const feature = (row.feature_status || "").toLowerCase();
  const isActiveVerified = listing === "active" && verification === "verified";

  if (!isActiveVerified && ["pending", "inactive", "rejected"].includes(listing)) {
    actions.push({
      id: "approve_listing",
      label: "Approve & verify",
      tone: "success",
    });
  }

  if (verification === "pending") {
    actions.push({ id: "mark_under_review", label: "Mark under review" });
  }

  if (feature === "pending") {
    actions.push({ id: "feature_approve", label: "Approve featuring", tone: "success" });
    actions.push({
      id: "feature_reject",
      label: "Reject featuring",
      tone: "danger",
      needsReason: true,
    });
  } else {
    actions.push({
      id: "feature_toggle",
      label: row.is_featured ? "Remove featuring" : "Mark featured",
    });
  }

  if (listing !== "inactive" && verification !== "suspended") {
    actions.push({
      id: "suspend",
      label: "Suspend",
      tone: "danger",
      needsReason: true,
    });
  } else if (listing === "inactive" || verification === "suspended") {
    actions.push({ id: "reactivate", label: "Reactivate", tone: "success" });
  }

  return actions;
}

export function gymActionPatch(
  action: GymActionId,
): Record<string, unknown> | null {
  switch (action) {
    case "approve_listing":
      return { status: "active", verification_status: "verified" };
    case "mark_under_review":
      return { verification_status: "under_review" };
    case "suspend":
      return { status: "inactive", verification_status: "suspended" };
    case "reactivate":
      return { status: "active", verification_status: "verified" };
    case "feature_approve":
      return { is_featured: true, feature_status: "approved" };
    case "feature_reject":
      return { is_featured: false, feature_status: "rejected" };
    default:
      return null;
  }
}
