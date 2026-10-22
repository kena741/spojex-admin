export type GymStatus = "pending" | "active" | "inactive" | "rejected";

export type GymVerificationStatus =
  | "pending"
  | "under_review"
  | "verified"
  | "rejected"
  | "suspended";

export type GymFeatureStatus = "none" | "pending" | "approved" | "rejected";

export type GymCategory = string;

/** Seed / fallback labels when gym_categories table is empty. */
export const gymCategories: { id: string; label: string; emoji?: string }[] = [
  { id: "gym", label: "Gym", emoji: "🏋️" },
  { id: "fitness_center", label: "Fitness center", emoji: "💪" },
  { id: "football_academy", label: "Football academy", emoji: "⚽" },
  { id: "sports_club", label: "Sports club", emoji: "🏅" },
  { id: "swimming_pool", label: "Swimming pool", emoji: "🏊" },
  { id: "martial_arts", label: "Martial arts", emoji: "🥋" },
  { id: "other", label: "Other", emoji: "•" },
];

export type GymCategoryRow = {
  id: string;
  slug: string;
  label: string;
  emoji?: string | null;
  sort_order?: number;
};

const categoryLabelMap = new Map(gymCategories.map((item) => [item.id, item.label]));

/**
 * Resolve category label for display.
 * Unknown / legacy slugs are shown as-is with a legacy marker - never silently
 * remapped to another catalog option (e.g. do not force "Gym").
 */
export function gymCategoryLabel(
  category?: string | null,
  catalog?: GymCategoryRow[] | null,
) {
  const raw = (category ?? "").trim();
  if (!raw) return "Uncategorized";
  if (catalog?.length) {
    const hit = catalog.find(
      (item) =>
        item.slug === raw ||
        item.id === raw ||
        item.label.toLowerCase() === raw.toLowerCase(),
    );
    if (hit?.label) return hit.label;
  }
  const seeded = categoryLabelMap.get(raw);
  if (seeded) return seeded;
  return `${raw.replace(/_/g, " ")} (legacy)`;
}

export function gymRatingLabel(
  ratingAvg?: number | null,
  ratingCount?: number | null,
) {
  const count = Number(ratingCount ?? 0);
  const avg = Number(ratingAvg ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    if (!Number.isFinite(avg) || avg <= 0) return "0 rating";
  }
  return Number.isFinite(avg) ? avg.toFixed(1) : "0 rating";
}

/** Monthly Gym→Spojex platform fee (not member prices / commission). */
export function gymPlatformFeeLabel(amount?: number | null, currency = "ETB") {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return `${currency} 0 / month`;
  return `${currency} ${value.toLocaleString("en-ET", { maximumFractionDigits: 2 })} / month`;
}

export const gymStatuses: { id: GymStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "rejected", label: "Rejected" },
];

export const gymVerificationStatuses: { id: GymVerificationStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "under_review", label: "Under review" },
  { id: "verified", label: "Verified" },
  { id: "rejected", label: "Rejected" },
  { id: "suspended", label: "Suspended" },
];

export const gymFeatureStatuses: { id: GymFeatureStatus; label: string }[] = [
  { id: "none", label: "Not requested" },
  { id: "pending", label: "Feature pending" },
  { id: "approved", label: "Featured" },
  { id: "rejected", label: "Feature rejected" },
];

export function slugifyGym(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type GymStaffRole = "owner" | "manager" | "receptionist" | "trainer";

export const gymStaffRoles: { id: GymStaffRole; label: string }[] = [
  { id: "owner", label: "Owner" },
  { id: "manager", label: "Manager" },
  { id: "receptionist", label: "Receptionist" },
  { id: "trainer", label: "Trainer" },
];

const staffRoleLabelMap = new Map(gymStaffRoles.map((item) => [item.id, item.label]));

export function gymStaffRoleLabel(role?: string | null) {
  if (!role) return "Staff";
  return staffRoleLabelMap.get(role as GymStaffRole) ?? role.replace(/_/g, " ");
}

export function gymStatusLabel(status?: string | null) {
  if (!status) return "-";
  return gymStatuses.find((item) => item.id === status)?.label ?? status.replace(/_/g, " ");
}

export function gymVerificationLabel(status?: string | null) {
  if (!status) return "-";
  return (
    gymVerificationStatuses.find((item) => item.id === status)?.label ??
    status.replace(/_/g, " ")
  );
}

export function gymFeatureLabel(status?: string | null, isFeatured?: boolean | null) {
  if (isFeatured) return "Featured";
  if (!status || status === "none") return "Not featured";
  return (
    gymFeatureStatuses.find((item) => item.id === status)?.label ??
    status.replace(/_/g, " ")
  );
}

export type GymOwnerEmbed = {
  id: string;
  display_name: string | null;
  email: string | null;
  role?: string | null;
  phone?: string | null;
} | null;

export type GymStaffRow = {
  id: string;
  gym_id: string;
  user_id: string;
  staff_role: string;
  is_active: boolean;
  created_at: string;
  users?: GymOwnerEmbed;
};

export type GymMembershipSummary = {
  id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  purchased_plan_title?: string | null;
  purchased_price_amount?: number | null;
  purchased_currency?: string | null;
  purchased_duration_months?: number | null;
  gym_plans?: { title: string | null } | { title: string | null }[] | null;
};

export type GymMemberEntitlement = {
  community_status: "active" | "inactive";
  access_type:
    | "paid_subscription"
    | "complimentary"
    | "pending_payment"
    | "expired_subscription"
    | "community_only"
    | "inactive_roster";
  payment_state: string;
  entitlement_status: string;
  plan_title: string | null;
};

/** Roster active ≠ paid entitlement. Classify for admin display. */
export function classifyGymMemberEntitlement(
  member: {
    is_active: boolean;
    gym_memberships?: GymMembershipSummary[] | null;
  },
  today = new Date(),
): GymMemberEntitlement {
  const roster = member.is_active ? "active" : "inactive";
  const list = member.gym_memberships ?? [];
  const todayIso = today.toISOString().slice(0, 10);

  let activePaid: GymMembershipSummary | null = null;
  let pending: GymMembershipSummary | null = null;
  let expired: GymMembershipSummary | null = null;
  for (const m of list) {
    const st = (m.status || "").toLowerCase();
    const end = m.end_date ? String(m.end_date).slice(0, 10) : null;
    const expiredByDate = Boolean(end && end < todayIso);
    if (st === "pending" || st === "pending_payment") pending = pending ?? m;
    else if (st === "active" && !expiredByDate) activePaid = activePaid ?? m;
    else if (st === "expired" || st === "cancelled" || st === "canceled" || expiredByDate) {
      expired = expired ?? m;
    }
  }

  const planTitle = (m: GymMembershipSummary | null) => {
    if (!m) return null;
    if (m.purchased_plan_title) return m.purchased_plan_title;
    const plan = m.gym_plans;
    if (!plan) return null;
    if (Array.isArray(plan)) return plan[0]?.title ?? null;
    return plan.title ?? null;
  };

  if (activePaid) {
    const price = Number(activePaid.purchased_price_amount);
    const complimentary = Number.isFinite(price) && price <= 0;
    return {
      community_status: roster,
      access_type: complimentary ? "complimentary" : "paid_subscription",
      payment_state: complimentary ? "complimentary" : "paid",
      entitlement_status: "active",
      plan_title: planTitle(activePaid),
    };
  }
  if (pending) {
    return {
      community_status: roster,
      access_type: "pending_payment",
      payment_state: "pending",
      entitlement_status: "pending",
      plan_title: planTitle(pending),
    };
  }
  if (expired) {
    return {
      community_status: roster,
      access_type: "expired_subscription",
      payment_state: "n/a",
      entitlement_status: "expired",
      plan_title: planTitle(expired),
    };
  }
  if (member.is_active) {
    return {
      community_status: roster,
      access_type: "community_only",
      payment_state: "none",
      entitlement_status: "roster_only",
      plan_title: null,
    };
  }
  return {
    community_status: roster,
    access_type: "inactive_roster",
    payment_state: "none",
    entitlement_status: "none",
    plan_title: null,
  };
}

/** Membership package sold in the app (duration drives subscription expiry). */
export type GymPlanRow = {
  id: string;
  gym_id: string;
  title: string;
  description?: string | null;
  plan_type: string;
  price_amount: number;
  currency: string;
  duration_days: number;
  duration_months?: number | null;
  is_active: boolean;
  sort_order: number;
  benefits?: string[] | null;
  created_at?: string | null;
  /** Present when loaded from the Python plans directory. */
  active_subscribers?: number | null;
  lifetime_subscriptions?: number | null;
  visibility?: string | null;
};

export function gymPlanMonthsLabel(months?: number | null, days?: number | null) {
  const m =
    months != null && Number.isFinite(Number(months)) && Number(months) > 0
      ? Math.floor(Number(months))
      : Math.max(1, Math.round(Number(days || 30) / 30));
  return m === 1 ? "1 month" : `${m} months`;
}

export type GymMemberRow = {
  id: string;
  gym_id: string;
  user_id: string | null;
  member_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
  users?: GymOwnerEmbed;
  gym_memberships?: GymMembershipSummary[] | null;
};

export type GymRow = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  cover_url: string | null;
  description: string | null;
  location: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
  status: string;
  verification_status: string;
  is_featured?: boolean | null;
  feature_status?: string | null;
  feature_requested_at?: string | null;
  feature_reviewed_at?: string | null;
  rating_avg: number | null;
  follower_count: number | null;
  rating_count?: number | null;
  /** Monthly platform fee in ETB (not a commission percent). */
  monthly_payment: number | null;
  /** Per-transaction platform commission % (payment flow; not edited as monthly fee). */
  commission_pct: number | null;
  membership_summary?: {
    active_plans?: number;
    active_roster?: number;
    active_entitlements?: number;
  } | null;
  category_display?: string | null;
  location_display?: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website?: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  /** Linked Spojex organization for private group + DM chat. */
  organization_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  users?: GymOwnerEmbed;
  /** Workspace API owner summary (Python). */
  owner?: {
    user_id?: string | null;
    display_name?: string | null;
    email?: string | null;
    operator_name?: string | null;
  } | null;
  category_unknown?: boolean | null;
};

// ---------------------------------------------------------------------------
// Workspace API payloads (Python admin gyms service, proxied by Next routes)
// ---------------------------------------------------------------------------

export type GymUiTone = "success" | "warning" | "danger" | "info" | "neutral";

/** Parse numeric API values that may arrive as strings (Decimal) or null. */
export function gymNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Whole-number metric, or "-" when the backend did not provide it. */
export function gymMetricLabel(value: unknown) {
  const n = gymNum(value);
  return n === null ? "-" : n.toLocaleString("en-ET");
}

export function gymVerificationTone(status?: string | null): GymUiTone {
  switch ((status ?? "").toLowerCase()) {
    case "verified":
      return "success";
    case "pending":
    case "under_review":
      return "warning";
    case "rejected":
    case "suspended":
      return "danger";
    default:
      return "neutral";
  }
}

export function gymListingTone(status?: string | null): GymUiTone {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return "success";
    case "pending":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

export function gymFeatureTone(status?: string | null, isFeatured?: boolean | null): GymUiTone {
  if (isFeatured) return "success";
  if (status === "pending") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

export type GymWorkspaceAction = {
  id: string;
  label: string;
  tone?: "default" | "success" | "danger" | string | null;
  needs_reason?: boolean;
  description?: string | null;
};

export type GymAdminEvent = {
  id: string;
  action: string;
  reason?: string | null;
  previous_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  actor_user_id?: string | null;
  created_at: string;
};

export type GymWorkspace = {
  data: GymRow;
  readiness?: {
    label?: string;
    issues?: string[];
    public_visible?: boolean;
    purchasable?: boolean;
    plan_count?: number;
    suspension_policy?: { note?: string } | null;
  } | null;
  allowed_actions?: GymWorkspaceAction[];
  overview?: {
    paid_active_memberships?: number | null;
    community_members?: number | null;
    community_total?: number | null;
    followers?: number | null;
    expiring_soon_14d?: number | null;
    pending_memberships?: number | null;
    definitions?: Record<string, string>;
    period?: {
      label?: string;
      timezone?: string;
      verified_collections?: string | null;
      platform_commission?: string | null;
      gym_net?: string | null;
      currency?: string;
      note?: string;
    } | null;
    config_issues?: string[];
  } | null;
  organization?: {
    id?: string | null;
    name?: string | null;
    href?: string | null;
    available?: boolean;
  } | null;
  community_summary?: {
    linked?: boolean;
    room_state?: string | null;
    participant_count?: number | null;
    posting_mode?: string | null;
    href?: string;
    note?: string | null;
  } | null;
  finance?: {
    customer_memberships?: {
      verified_gross?: string | null;
      platform_commission?: string | null;
      gym_earnings?: string | null;
      verified_count?: number;
      pending_count?: number;
      refunds?: number;
      currency?: string;
      label?: string;
      href?: string;
    } | null;
    platform_fee?: {
      amount?: number | string | null;
      currency?: string;
      note?: string;
      invoice_history_available?: boolean;
    } | null;
    settlement?: { available?: boolean; note?: string } | null;
    payouts?: { available?: boolean; note?: string } | null;
  } | null;
  staff_capabilities?: Record<string, string>;
  role_default_capabilities?: Record<string, string[]>;
  suspension_policy?: { note?: string } | null;
  recent_events?: GymAdminEvent[];
  generated_at?: string;
};

export type GymMemberAccessType =
  | GymMemberEntitlement["access_type"]
  | string;

export type GymDirectoryMember = {
  id: string;
  user_id: string | null;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  member_code?: string | null;
  is_active: boolean;
  created_at?: string;
  user_display_name?: string | null;
  user_email?: string | null;
  plan_label?: string | null;
  source_note?: string | null;
  membership_count?: number;
  entitlement?: {
    community_status?: string;
    access_type?: GymMemberAccessType;
    payment_state?: string;
    entitlement_status?: string;
    plan_title?: string | null;
    note?: string;
  } | null;
  current_membership?: {
    id?: string;
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
    purchased_plan_title?: string | null;
  } | null;
};

export const GYM_COMMUNITY_ONLY_LABEL = "Community roster (no plan)";

export function gymMemberAccessLabel(accessType?: string | null) {
  switch (accessType) {
    case "paid_subscription":
      return "Paid";
    case "complimentary":
      return "Complimentary";
    case "pending_payment":
      return "Pending payment";
    case "expired_subscription":
      return "Expired";
    case "community_only":
      return "Community only";
    case "inactive_roster":
      return "Inactive";
    default:
      return accessType ? accessType.replace(/_/g, " ") : "-";
  }
}

export function gymMemberAccessTone(accessType?: string | null): GymUiTone {
  switch (accessType) {
    case "paid_subscription":
    case "complimentary":
      return "success";
    case "pending_payment":
      return "warning";
    case "expired_subscription":
      return "danger";
    default:
      return "neutral";
  }
}

/** Never returns blank - roster-only members get an explicit label. */
export function gymMemberPlanLabel(member: GymDirectoryMember) {
  const raw = (
    member.plan_label ||
    member.entitlement?.plan_title ||
    member.current_membership?.purchased_plan_title ||
    ""
  ).trim();
  if (raw && raw !== "-") return { label: raw, rosterOnly: false };
  const access = member.entitlement?.access_type;
  if (!access || access === "community_only" || access === "inactive_roster") {
    return { label: GYM_COMMUNITY_ONLY_LABEL, rosterOnly: true };
  }
  return { label: "Plan not recorded", rosterOnly: false };
}

export type GymMemberDetail = {
  member: GymDirectoryMember & { user_display_name?: string | null };
  entitlement?: GymDirectoryMember["entitlement"];
  memberships?: Array<{
    id: string;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    purchased_plan_title?: string | null;
    current_plan_title?: string | null;
    purchased_price_amount?: string | number | null;
    purchased_currency?: string | null;
  }>;
  payments?: Array<{
    id: string;
    amount?: string | number | null;
    currency?: string | null;
    commission_amount?: string | number | null;
    gym_net_amount?: string | number | null;
    payment_type?: string | null;
    status?: string | null;
    paid_at?: string | null;
    created_at: string;
  }>;
  attendance?: { supported?: boolean; checkins?: number };
  community?: {
    org_member?: { member_role?: string; status?: string; joined_at?: string } | null;
    note?: string;
  };
  actions?: {
    deactivate_preserves_finance?: boolean;
    remove_preserves_finance?: boolean;
    note?: string;
  };
};

export type GymCommunity = {
  linked?: boolean;
  room_state?: string | null;
  configuration_state?: string | null;
  participant_count?: number | null;
  posting_mode?: string | null;
  pending_join_requests?: number | null;
  organization?: {
    id?: string;
    name?: string | null;
    href?: string;
    active_members?: number | null;
  } | null;
  conversation?: { id?: string; last_message_at?: string | null } | null;
  settings?: {
    group_visibility?: string | null;
    who_can_post?: string | null;
    allow_members_send?: boolean | null;
    allow_media?: boolean | null;
    allow_reactions?: boolean | null;
  } | null;
  access_policy?: Record<string, string> | null;
  open_conversation_href?: string | null;
  reports?: { available?: boolean; note?: string } | null;
  note?: string | null;
  messages_note?: string | null;
  source?: string;
};

export type GymFinanceTxn = {
  id: string;
  amount?: string | number | null;
  currency?: string | null;
  commission_amount?: string | number | null;
  gym_net_amount?: string | number | null;
  payment_type?: string | null;
  status?: string | null;
  paid_at?: string | null;
  created_at: string;
  member_name?: string | null;
  plan_title?: string | null;
  member_id?: string | null;
  finance_href?: string;
  member_href?: string | null;
};

export type GymFinance = {
  ok?: boolean;
  source?: string;
  upstream_warning?: string | null;
  error?: string;
  period?: { days?: number; label?: string; timezone?: string };
  customer_collections?: {
    verified_gross?: string | null;
    platform_commission?: string | null;
    gym_net_earnings?: string | null;
    refunds_amount?: string | null;
    verified_count?: number;
    pending_count?: number;
    currency?: string;
    note?: string;
  } | null;
  by_payment_type?: Array<{
    payment_type: string;
    n?: number;
    amount?: string | null;
    commission?: string | null;
    gym_net?: string | null;
  }>;
  platform_subscription_fee?: {
    configured_monthly?: string | null;
    currency?: string;
    invoice_history_available?: boolean;
    note?: string;
  } | null;
  settlement?: { available?: boolean; note?: string } | null;
  payouts?: { available?: boolean; note?: string } | null;
  transactions?: GymFinanceTxn[];
  exclusions?: string[];
};
