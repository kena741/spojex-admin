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

export function gymCategoryLabel(
  category?: string | null,
  catalog?: GymCategoryRow[] | null,
) {
  if (!category) return "Gym";
  if (catalog?.length) {
    const hit = catalog.find((item) => item.slug === category || item.id === category);
    if (hit?.label) return hit.label;
  }
  return categoryLabelMap.get(category) ?? category.replace(/_/g, " ");
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
  if (!status) return "—";
  return gymStatuses.find((item) => item.id === status)?.label ?? status.replace(/_/g, " ");
}

export function gymVerificationLabel(status?: string | null) {
  if (!status) return "—";
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
  gym_plans?: { title: string | null } | { title: string | null }[] | null;
};

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
};
