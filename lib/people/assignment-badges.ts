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

/** Prefer active_roles embed + assignments → users.role mirror. */
export function collectProfileBadges(opts: {
  assignments?: AssignmentLike[] | null;
  activeRoles?: AssignmentLike[] | null;
  role?: string | null;
}): string[] {
  const badges: string[] = [];
  const push = (b: string | null) => {
    if (b && !badges.includes(b)) badges.push(b);
  };

  // active_roles is attached per user by the backend — prefer it over batched assignment pages.
  for (const row of opts.activeRoles ?? []) push(badgeFromAssignment(row));
  for (const row of opts.assignments ?? []) push(badgeFromAssignment(row));
  if (!badges.length) {
    const cat = categoryFor(opts.role);
    if (cat === "athlete" || cat === "professional" || cat === "media") push(cat);
  }
  return badges;
}

type ProfileFilterKind = "athlete" | "professional" | "media" | "fan";

/**
 * Paginate `/data/user_role_assignments` with server-side filters.
 * The Spojex query builder caps client pages at 500 and can drop server filters — do not use it here.
 */
export async function listAssignmentUserIds(opts: {
  baseUrl: string;
  token: string;
  profile: ProfileFilterKind;
}): Promise<string[] | null> {
  const ids = new Set<string>();
  const pageSize = 500;
  let offset = 0;

  for (let page = 0; page < 40; page += 1) {
    const params = new URLSearchParams({
      status: "active",
      limit: String(pageSize),
      offset: String(offset),
    });
    if (opts.profile === "athlete") params.set("account_role", "athlete");
    else if (opts.profile === "fan") params.set("account_role", "fan");
    else if (opts.profile === "media" || opts.profile === "professional") {
      params.set("account_role", "professional");
    }

    const res = await fetch(
      `${opts.baseUrl.replace(/\/$/, "")}/api/v1/data/user_role_assignments?${params}`,
      { headers: { Authorization: `Bearer ${opts.token}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as
      | Array<{ user_id?: string; category_slug?: string | null }>
      | null;
    if (!Array.isArray(rows) || !rows.length) break;

    for (const row of rows) {
      const uid = String(row.user_id ?? "").trim();
      if (!uid) continue;
      const category = String(row.category_slug ?? "").trim();
      if (opts.profile === "media") {
        if (!MEDIA_CATEGORY_SLUGS.includes(category)) continue;
      } else if (opts.profile === "professional") {
        if (MEDIA_CATEGORY_SLUGS.includes(category)) continue;
      }
      ids.add(uid);
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return [...ids];
}

export function profileTypeBadges(badges: string[]): Array<"athlete" | "professional" | "media"> {
  return badges.filter(
    (b): b is "athlete" | "professional" | "media" =>
      b === "athlete" || b === "professional" || b === "media",
  );
}

export { MEDIA_CATEGORY_SLUGS, PROFESSIONAL_CATEGORY_SLUGS };
