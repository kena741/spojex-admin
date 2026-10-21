export const opportunityStatuses = ["coming_soon", "open", "closed"] as const;
export type OpportunityStatus = (typeof opportunityStatuses)[number];

export const opportunityFeeTypes = ["free", "paid"] as const;
export type OpportunityFeeType = (typeof opportunityFeeTypes)[number];

export const applicationStatuses = [
  "draft",
  "submitted",
  "under_review",
  "shortlisted",
  "accepted",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];

export const ELIGIBLE_ROLE_OPTIONS = [
  { value: "player", label: "Player" },
  { value: "scout", label: "Scout" },
  { value: "agent", label: "Agent" },
  { value: "coach", label: "Coach" },
  { value: "fan", label: "Fan" },
  { value: "referee", label: "Referee" },
  { value: "analyst", label: "Analyst" },
  { value: "fitness_coach", label: "Fitness coach" },
  { value: "physiotherapist", label: "Physiotherapist" },
  { value: "nutritionist", label: "Nutritionist" },
  { value: "administrator", label: "Administrator" },
  { value: "other_professional", label: "Other professional" },
] as const;

export type OpportunityRow = {
  id: string;
  title: string;
  cover_image_url: string;
  description: string;
  category: string;
  organizer: string;
  location: string;
  country: string;
  start_date: string | null;
  end_date: string | null;
  application_opens_at: string | null;
  application_deadline: string | null;
  status: OpportunityStatus;
  is_published: boolean;
  fee_type: OpportunityFeeType;
  fee_amount: number;
  min_profile_completion: number;
  max_applicants: number | null;
  eligibility_requirements: string;
  required_documents: string;
  required_fields: unknown;
  eligible_roles: string[] | null;
  external_link: string;
  additional_terms: string;
  allow_multiple_applications: boolean;
  created_at: string;
  updated_at: string;
  applicant_count?: number;
  waitlist_count?: number;
};

export type OpportunityRevenue = {
  total_applicants: number;
  paid_applicants: number;
  successful_payments: number;
  total_collected: number;
  waitlist_count: number;
};

export function opportunityStatusLabel(status: string) {
  switch (status) {
    case "open":
      return "Open for Applications";
    case "coming_soon":
      return "Coming Soon";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}

export function applicationStatusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function opportunityStatusTone(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "open":
      return "success";
    case "coming_soon":
      return "info";
    case "closed":
      return "neutral";
    default:
      return "neutral";
  }
}

export function formatOpportunityFee(
  feeType: string,
  amount: number | string | null | undefined,
) {
  if (feeType === "free" || feeType !== "paid") {
    return "Not required — free opportunity";
  }
  const n = Number(amount || 0);
  if (!(n > 0)) return "Paid (fee not set)";
  return `ETB ${Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2)}`;
}

/** Client-side checks mirroring Python validate_opportunity_payload. */
export function validateOpportunityDraft(draft: OpportunityDraft): string | null {
  if (!draft.title.trim()) return "Title is required";
  if (draft.fee_type === "paid" && !(Number(draft.fee_amount) > 0)) {
    return "Paid opportunities need a fee greater than 0";
  }
  const ext = draft.external_link.trim();
  if (ext && !/^https?:\/\//i.test(ext)) {
    return "External URL must start with http:// or https://";
  }
  if (
    draft.application_opens_at &&
    draft.application_deadline &&
    draft.application_opens_at > draft.application_deadline
  ) {
    return "Applications open time must be before the deadline";
  }
  if (draft.start_date && draft.end_date && draft.start_date > draft.end_date) {
    return "Event start must be on or before event end";
  }
  if (
    draft.max_applicants &&
    (!Number.isFinite(Number(draft.max_applicants)) || Number(draft.max_applicants) < 1)
  ) {
    return "Capacity must be a positive number or empty (unlimited)";
  }
  return null;
}

export function emptyOpportunityDraft() {
  return {
    title: "",
    cover_image_url: "",
    description: "",
    category: "Trial",
    organizer: "",
    location: "",
    country: "Ethiopia",
    start_date: "",
    end_date: "",
    application_opens_at: "",
    application_deadline: "",
    status: "coming_soon" as OpportunityStatus,
    is_published: false,
    fee_type: "free" as OpportunityFeeType,
    fee_amount: "0",
    min_profile_completion: "60",
    max_applicants: "",
    eligibility_requirements: "",
    required_documents: "",
    eligible_roles: [] as string[],
    external_link: "",
    additional_terms: "",
    allow_multiple_applications: false,
  };
}

export type OpportunityDraft = ReturnType<typeof emptyOpportunityDraft>;

export function draftToPayload(draft: OpportunityDraft) {
  const feeType = draft.fee_type;
  const feeAmount =
    feeType === "paid" ? Math.max(0, Number(draft.fee_amount) || 0) : 0;
  const maxRaw = draft.max_applicants.trim();
  return {
    title: draft.title.trim(),
    cover_image_url: draft.cover_image_url.trim(),
    description: draft.description.trim(),
    category: draft.category.trim() || "General",
    organizer: draft.organizer.trim(),
    location: draft.location.trim(),
    country: draft.country.trim(),
    start_date: draft.start_date.trim() || null,
    end_date: draft.end_date.trim() || null,
    application_opens_at: draft.application_opens_at.trim()
      ? new Date(draft.application_opens_at).toISOString()
      : null,
    application_deadline: draft.application_deadline.trim()
      ? new Date(draft.application_deadline).toISOString()
      : null,
    status: draft.status,
    is_published: draft.is_published,
    fee_type: feeType,
    fee_amount: feeAmount,
    min_profile_completion: Math.min(
      100,
      Math.max(0, Number(draft.min_profile_completion) || 0),
    ),
    max_applicants: maxRaw ? Math.max(1, Number(maxRaw) || 1) : null,
    eligibility_requirements: draft.eligibility_requirements.trim(),
    required_documents: draft.required_documents.trim(),
    eligible_roles: draft.eligible_roles,
    external_link: draft.external_link.trim(),
    additional_terms: draft.additional_terms.trim(),
    allow_multiple_applications: draft.allow_multiple_applications,
  };
}

export function rowToDraft(row: OpportunityRow): OpportunityDraft {
  const toLocalInput = (value: string | null) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => `${n}`.padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return {
    title: row.title ?? "",
    cover_image_url: row.cover_image_url ?? "",
    description: row.description ?? "",
    category: row.category ?? "General",
    organizer: row.organizer ?? "",
    location: row.location ?? "",
    country: row.country ?? "",
    start_date: row.start_date ?? "",
    end_date: row.end_date ?? "",
    application_opens_at: toLocalInput(row.application_opens_at),
    application_deadline: toLocalInput(row.application_deadline),
    status: (row.status as OpportunityStatus) || "coming_soon",
    is_published: row.is_published === true,
    fee_type: (row.fee_type as OpportunityFeeType) || "free",
    fee_amount: `${row.fee_amount ?? 0}`,
    min_profile_completion: `${row.min_profile_completion ?? 60}`,
    max_applicants: row.max_applicants == null ? "" : `${row.max_applicants}`,
    eligibility_requirements: row.eligibility_requirements ?? "",
    required_documents: row.required_documents ?? "",
    eligible_roles: Array.isArray(row.eligible_roles) ? [...row.eligible_roles] : [],
    external_link: row.external_link ?? "",
    additional_terms: row.additional_terms ?? "",
    allow_multiple_applications: row.allow_multiple_applications === true,
  };
}
