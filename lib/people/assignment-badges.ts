import { categoryFor, mediaRoles, professionalRoles } from "@/lib/catalog";

const MEDIA_CATEGORY_SLUGS = mediaRoles.map((r) => r.id);
const PROFESSIONAL_CATEGORY_SLUGS = professionalRoles.map((r) => r.id);

export type AssignmentLike = {
  account_role?: string | null;
  category_slug?: string | null;
};

/** Map an active assignment (or active_roles embed) to a People badge slug. */
export function badgeFromAssignment(row: AssignmentLike): string | null {
  const account = String(row.account_role ?? "").trim();
  const category = String(row.category_slug ?? "").trim();
  if (account === "athlete") return "athlete";
  if (account === "fan") return "fan";
  if (account === "professional") {
    if (MEDIA_CATEGORY_SLUGS.includes(category)) return "media";
    if (PROFESSIONAL_CATEGORY_SLUGS.includes(category) || !category) return "professional";
    return "professional";
  }
  if (account === "media") return "media";
  return null;
}

/** Prefer assignments → active_roles embed → users.role mirror. */
export function collectProfileBadges(opts: {
  assignments?: AssignmentLike[] | null;
  activeRoles?: AssignmentLike[] | null;
  role?: string | null;
}): string[] {
  const badges: string[] = [];
  const push = (b: string | null) => {
    if (b && !badges.includes(b)) badges.push(b);
  };

  for (const row of opts.assignments ?? []) push(badgeFromAssignment(row));
  if (!badges.length) {
    for (const row of opts.activeRoles ?? []) push(badgeFromAssignment(row));
  }
  if (!badges.length) {
    const cat = categoryFor(opts.role);
    if (cat === "athlete" || cat === "professional" || cat === "media") push(cat);
  }
  return badges;
}

export function profileTypeBadges(badges: string[]): Array<"athlete" | "professional" | "media"> {
  return badges.filter(
    (b): b is "athlete" | "professional" | "media" =>
      b === "athlete" || b === "professional" || b === "media",
  );
}

export { MEDIA_CATEGORY_SLUGS, PROFESSIONAL_CATEGORY_SLUGS };
