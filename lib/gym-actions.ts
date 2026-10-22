import type { GymRow } from "@/lib/gyms";

export type GymActionId =
  | "approve_listing"
  | "mark_under_review"
  | "revoke_verification"
  | "activate_listing"
  | "deactivate_listing"
  | "reject_listing"
  | "suspend"
  | "reactivate"
  | "feature_approve"
  | "feature_reject"
  | "feature_toggle"
  | "transfer_ownership"
  | "edit";

export type GymAction = {
  id: GymActionId;
  label: string;
  tone?: "default" | "success" | "danger";
  needsReason?: boolean;
  description?: string;
};

/**
 * Allowed gym admin actions for the current listing / verification / feature state.
 * Listing, verification, and featuring are separate axes - do not show Approve for
 * an already active+verified gym.
 *
 * Prefer `workspace.allowed_actions` from the Python API when available; this helper
 * is the client-side mirror for offline/local fallbacks.
 */
export function gymAllowedActions(row: GymRow): GymAction[] {
  const actions: GymAction[] = [{ id: "edit", label: "Edit profile" }];

  const listing = (row.status || "").toLowerCase();
  const verification = (row.verification_status || "").toLowerCase();
  const feature = (row.feature_status || "").toLowerCase();
  const isActiveVerified = listing === "active" && verification === "verified";

  // Never show Approve when verification is already complete.
  if (
    !isActiveVerified &&
    verification !== "verified" &&
    ["pending", "inactive", "rejected"].includes(listing)
  ) {
    actions.push({
      id: "approve_listing",
      label: "Approve & verify",
      tone: "success",
      description: "Sets listing to active and verification to verified.",
    });
  }

  if (verification === "pending") {
    actions.push({ id: "mark_under_review", label: "Mark under review" });
  }

  if (verification === "verified") {
    actions.push({
      id: "revoke_verification",
      label: "Revoke verification",
      tone: "danger",
      needsReason: true,
    });
  }

  if (listing === "active") {
    actions.push({ id: "deactivate_listing", label: "Deactivate listing" });
  } else if (listing === "inactive" || listing === "pending") {
    actions.push({
      id: "activate_listing",
      label: "Activate listing",
      tone: "success",
    });
  }

  if (listing !== "rejected" && verification !== "rejected") {
    actions.push({
      id: "reject_listing",
      label: "Reject",
      tone: "danger",
      needsReason: true,
    });
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
      return { action: "approve_listing" };
    case "mark_under_review":
      return { action: "mark_under_review" };
    case "revoke_verification":
      return { action: "revoke_verification" };
    case "activate_listing":
      return { action: "activate_listing" };
    case "deactivate_listing":
      return { action: "deactivate_listing" };
    case "reject_listing":
      return { action: "reject_listing" };
    case "suspend":
      return { action: "suspend" };
    case "reactivate":
      return { action: "reactivate" };
    case "feature_approve":
      return { action: "feature_approve" };
    case "feature_reject":
      return { action: "feature_reject" };
    case "feature_toggle":
      return { action: "feature_toggle" };
    default:
      return null;
  }
}

export const GYM_SUSPENSION_POLICY = {
  new_purchases: "blocked",
  existing_member_access: "preserved until expiry or separate revocation",
  public_visibility: "hidden",
  provider_operations: "read-only until admin reactivates",
} as const;
