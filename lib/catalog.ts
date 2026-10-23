export type RoleCategory = "none" | "community" | "athlete" | "professional" | "media";

export type CatalogOption = {
  id: string;
  label: string;
};

export const communityRoles: CatalogOption[] = [
  { id: "fan", label: "Fan" },
  { id: "parent_guardian", label: "Parent / Guardian" },
];

export const athleteRoles: CatalogOption[] = [{ id: "player", label: "Player" }];

export const professionalRoles: CatalogOption[] = [
  { id: "coach", label: "Coach" },
  { id: "scout", label: "Scout" },
  { id: "agent", label: "Agent" },
  { id: "referee", label: "Referee" },
  { id: "analyst", label: "Analyst" },
  { id: "fitness_coach", label: "Fitness / Performance" },
  { id: "physiotherapist", label: "Physiotherapist" },
  { id: "nutritionist", label: "Nutritionist" },
  { id: "consultant", label: "Consultant" },
  { id: "administrator", label: "Administrator" },
  { id: "medical", label: "Medical" },
  { id: "other_professional", label: "Other Football Professional" },
];

export const mediaRoles: CatalogOption[] = [
  { id: "photographer", label: "Photographer / Videographer" },
  { id: "sports_journalist", label: "Journalist / Media" },
];

export const allRoles: CatalogOption[] = [
  { id: "", label: "No role" },
  ...communityRoles,
  ...athleteRoles,
  ...professionalRoles,
  ...mediaRoles,
];

export const organizationTypes: CatalogOption[] = [
  { id: "club", label: "Club" },
  { id: "academy", label: "Academy" },
  { id: "federation", label: "Federation" },
  { id: "league", label: "League" },
  { id: "school", label: "School" },
  { id: "university", label: "University" },
  { id: "tournament_organizer", label: "Tournament Organizer" },
  { id: "ngo", label: "NGO / Foundation" },
  { id: "sports_company", label: "Sports Company" },
  { id: "medical_provider", label: "Medical Provider" },
  { id: "media_organization", label: "Media Organization" },
  { id: "sponsor", label: "Sponsor" },
  { id: "facility", label: "Sports Facility" },
  { id: "travel_provider", label: "Travel Provider" },
  { id: "equipment_provider", label: "Equipment Provider" },
  { id: "technology_company", label: "Technology Company" },
  { id: "other_organization", label: "Other Football Organization" },
];

const roleLabelMap = new Map(allRoles.map((role) => [role.id, role.label]));
const orgLabelMap = new Map(organizationTypes.map((item) => [item.id, item.label]));

export function roleLabel(role?: string | null) {
  if (!role) return "No role";
  return roleLabelMap.get(role) ?? formatFallback(role);
}

export function organizationTypeLabel(type?: string | null) {
  if (!type) return "Organization";
  // Legacy rows: gym orgs are managed under Admin → Gyms, not Organizations.
  if (type === "gym") return "Gym";
  return orgLabelMap.get(type) ?? formatFallback(type);
}

export function categoryFor(role?: string | null): RoleCategory {
  const id = (role ?? "").trim();
  if (!id) return "none";
  if (communityRoles.some((item) => item.id === id)) return "community";
  if (athleteRoles.some((item) => item.id === id)) return "athlete";
  if (professionalRoles.some((item) => item.id === id)) return "professional";
  if (mediaRoles.some((item) => item.id === id)) return "media";
  return "none";
}

export function extraProfileTable(role?: string | null) {
  switch (categoryFor(role)) {
    case "athlete":
      return "athlete_profiles";
    case "professional":
      return "professional_profiles";
    case "media":
      return "media_profiles";
    default:
      return "";
  }
}

function formatFallback(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
