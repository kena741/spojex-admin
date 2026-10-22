export const verificationStatuses = [
  { id: "pending", label: "Pending" },
  { id: "in_review", label: "In Review" },
  { id: "needs_info", label: "Needs info" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;

export function verificationDocLabel(kind: string, label?: string) {
  if (label?.trim()) return label.trim();
  switch (kind) {
    case "national_id_front":
      return "National ID - front";
    case "national_id_back":
      return "National ID - back";
    case "professional_license":
      return "Professional license";
    case "professional_certificate":
      return "Certificate";
    case "press_credential":
      return "Press / media credential";
    case "media_portfolio":
      return "Media portfolio sample";
    case "federation_card":
      return "Federation / association card";
    case "club_letter":
      return "Club affiliation letter";
    case "other":
      return "Other document";
    default:
      return kind.replace(/_/g, " ");
  }
}

export function verificationStatusLabel(status?: string | null) {
  return verificationStatuses.find((item) => item.id === status)?.label ?? status ?? "-";
}
