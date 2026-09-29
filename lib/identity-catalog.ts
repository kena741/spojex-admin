import { getSupabase } from "@/lib/supabase/client";
import {
  identityRoleGroupSeeds,
  identityRoleSeeds,
  type IdentityRoleGroupSeed,
} from "@/lib/identity-catalog-seeds";

export type IdentityRoleGroup = IdentityRoleGroupSeed & {
  id: string;
  created_at?: string;
  updated_at?: string;
};

export type IdentityRole = {
  id: string;
  group_id: string;
  slug: string;
  label: string;
  blurb: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  created_at?: string;
  updated_at?: string;
  identity_role_groups?: Pick<IdentityRoleGroup, "slug" | "label"> | null;
};

export type IdentityCatalog = {
  groups: IdentityRoleGroup[];
  roles: IdentityRole[];
  fromDatabase: boolean;
};

function fallbackCatalog(): IdentityCatalog {
  const groups: IdentityRoleGroup[] = identityRoleGroupSeeds.map((group) => ({
    ...group,
    id: group.slug,
  }));
  const groupIdBySlug = new Map(groups.map((group) => [group.slug, group.id]));
  const roles: IdentityRole[] = identityRoleSeeds.map((role) => ({
    id: role.slug,
    group_id: groupIdBySlug.get(role.group_slug) ?? role.group_slug,
    slug: role.slug,
    label: role.label,
    blurb: role.blurb,
    sort_order: role.sort_order,
    is_active: true,
    is_system: true,
    identity_role_groups: {
      slug: role.group_slug,
      label: groups.find((group) => group.slug === role.group_slug)?.label ?? role.group_slug,
    },
  }));
  return { groups, roles, fromDatabase: false };
}

export async function fetchIdentityCatalog(): Promise<IdentityCatalog> {
  const client = getSupabase();
  const [{ data: groups, error: groupError }, { data: roles, error: roleError }] = await Promise.all([
    client.from("identity_role_groups").select("*").order("sort_order"),
    client
      .from("identity_roles")
      .select("*, identity_role_groups(slug, label)")
      .order("sort_order"),
  ]);

  if (groupError || roleError) {
    const message = groupError?.message ?? roleError?.message ?? "";
    if (
      message.includes("schema cache") ||
      message.includes("Could not find the table") ||
      message.includes("does not exist")
    ) {
      return fallbackCatalog();
    }
    throw new Error(message);
  }

  if (!groups?.length || !roles?.length) {
    return fallbackCatalog();
  }

  return {
    groups: groups as IdentityRoleGroup[],
    roles: roles as IdentityRole[],
    fromDatabase: true,
  };
}

export function roleOptionsFromCatalog(catalog: IdentityCatalog) {
  return [
    { id: "", label: "No role", group: "" },
    ...catalog.roles
      .filter((role) => role.is_active)
      .map((role) => ({
        id: role.slug,
        label: role.label,
        group: role.identity_role_groups?.label ?? "",
      })),
  ];
}

export function roleLabelFromCatalog(catalog: IdentityCatalog, slug?: string | null) {
  if (!slug) return "No role";
  const match = catalog.roles.find((role) => role.slug === slug);
  if (match) return match.label;
  return slug.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function categoryForSlug(catalog: IdentityCatalog, slug?: string | null) {
  if (!slug) return "none";
  const role = catalog.roles.find((item) => item.slug === slug);
  const groupSlug = role?.identity_role_groups?.slug;
  if (groupSlug === "community" || groupSlug === "athlete" || groupSlug === "professional" || groupSlug === "media") {
    return groupSlug;
  }
  return "none";
}

export function extraProfileTableForSlug(catalog: IdentityCatalog, slug?: string | null) {
  switch (categoryForSlug(catalog, slug)) {
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

export function hasMobileIdentitySeeds(catalog: IdentityCatalog) {
  const slugs = new Set(catalog.roles.map((role) => role.slug));
  return identityRoleSeeds.every((seed) => slugs.has(seed.slug));
}

const professionalCopy: Record<
  string,
  { title: string; organization: string; license: string }
> = {
  coach: {
    title: "Coaching information",
    organization: "Club / academy",
    license: "Coaching license",
  },
  scout: {
    title: "Scouting information",
    organization: "Network / club",
    license: "Scout license",
  },
  agent: {
    title: "Representation",
    organization: "Agency",
    license: "Agent license",
  },
  referee: {
    title: "Officiating",
    organization: "Federation / league",
    license: "Officiating grade",
  },
  medical: {
    title: "Medical information",
    organization: "Clinic / club medical",
    license: "Medical license",
  },
};

function professionalCopyPack(role?: string | null) {
  switch (role) {
    case "coach":
    case "scout":
    case "agent":
    case "referee":
      return role;
    case "medical":
    case "physiotherapist":
    case "nutritionist":
    case "fitness_coach":
      return "medical";
    default:
      return "professional";
  }
}

/** Same professional fields for every staff role; only labels change. */
export function professionalProfileCopy(role?: string | null) {
  return (
    professionalCopy[professionalCopyPack(role)] ?? {
      title: "Professional profile",
      organization: "Organization",
      license: "License",
    }
  );
}

