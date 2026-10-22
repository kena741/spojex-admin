/** Static fallback - mirrors mobile IdentityCatalog when DB tables are not applied yet. */

export type IdentityRoleGroupSeed = {
  slug: string;
  label: string;
  sort_order: number;
};

export type IdentityRoleSeed = {
  group_slug: string;
  slug: string;
  label: string;
  blurb: string;
  sort_order: number;
};

export const identityRoleGroupSeeds: IdentityRoleGroupSeed[] = [
  { slug: "community", label: "Community", sort_order: 1 },
  { slug: "athlete", label: "Athlete", sort_order: 2 },
  { slug: "professional", label: "Professional", sort_order: 3 },
  { slug: "media", label: "Media", sort_order: 4 },
];

export const identityRoleSeeds: IdentityRoleSeed[] = [
  { group_slug: "community", slug: "fan", label: "Fan", blurb: "Follow clubs, events, and communities.", sort_order: 1 },
  {
    group_slug: "community",
    slug: "parent_guardian",
    label: "Parent / Guardian",
    blurb: "Safeguarded access for a young player.",
    sort_order: 2,
  },
  {
    group_slug: "athlete",
    slug: "player",
    label: "Player",
    blurb: "Build identity, get discovered, apply to trials.",
    sort_order: 1,
  },
  { group_slug: "professional", slug: "coach", label: "Coach", blurb: "Reputation, roles, and staff opportunities.", sort_order: 1 },
  { group_slug: "professional", slug: "scout", label: "Scout", blurb: "Find talent and follow verified pipelines.", sort_order: 2 },
  {
    group_slug: "professional",
    slug: "agent",
    label: "Agent",
    blurb: "Represent players and manage professional pathways.",
    sort_order: 3,
  },
  {
    group_slug: "professional",
    slug: "referee",
    label: "Referee",
    blurb: "Match officials and officiating development.",
    sort_order: 4,
  },
  {
    group_slug: "professional",
    slug: "analyst",
    label: "Analyst",
    blurb: "Match analysis and performance insight.",
    sort_order: 5,
  },
  {
    group_slug: "professional",
    slug: "fitness_coach",
    label: "Fitness / Performance",
    blurb: "Strength, conditioning, and athletic development.",
    sort_order: 6,
  },
  {
    group_slug: "professional",
    slug: "physiotherapist",
    label: "Physiotherapist",
    blurb: "Injury prevention and return-to-play support.",
    sort_order: 7,
  },
  {
    group_slug: "professional",
    slug: "nutritionist",
    label: "Nutritionist",
    blurb: "Football nutrition and recovery planning.",
    sort_order: 8,
  },
  {
    group_slug: "professional",
    slug: "consultant",
    label: "Consultant",
    blurb: "Advisory work across clubs and programmes.",
    sort_order: 9,
  },
  {
    group_slug: "professional",
    slug: "administrator",
    label: "Administrator",
    blurb: "Club operations, compliance, and administration.",
    sort_order: 10,
  },
  {
    group_slug: "professional",
    slug: "medical",
    label: "Medical",
    blurb: "Sports medicine and clinical support.",
    sort_order: 11,
  },
  {
    group_slug: "professional",
    slug: "other_professional",
    label: "Other Football Professional",
    blurb: "A football role that is not in the list above.",
    sort_order: 12,
  },
  {
    group_slug: "media",
    slug: "photographer",
    label: "Photographer / Videographer",
    blurb: "Match-day media and highlight production.",
    sort_order: 1,
  },
  {
    group_slug: "media",
    slug: "sports_journalist",
    label: "Journalist / Media",
    blurb: "Reporting, content, and football storytelling.",
    sort_order: 2,
  },
];

export function slugifyIdentity(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
