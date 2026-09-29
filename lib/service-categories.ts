/** Matches mobile create_service_screen.dart — ids come from Supabase gen_random_uuid(). */

export type ServiceCategorySeed = {
  slug: string;
  label: string;
  emoji: string;
  sort_order: number;
};

export const mobileServiceCategories: ServiceCategorySeed[] = [
  { slug: "coaching", label: "Football Coaching", emoji: "⚽", sort_order: 1 },
  { slug: "fitness", label: "Personal Training", emoji: "💪", sort_order: 2 },
  { slug: "scouting", label: "Scouting", emoji: "🔎", sort_order: 3 },
  { slug: "performance", label: "Player Analysis", emoji: "🧠", sort_order: 4 },
  { slug: "medical", label: "Sports Medicine", emoji: "🏥", sort_order: 5 },
  { slug: "legal", label: "Legal Consulting", emoji: "⚖️", sort_order: 6 },
  { slug: "consulting", label: "Football Management", emoji: "📊", sort_order: 7 },
  { slug: "media", label: "Sports Photography", emoji: "📸", sort_order: 8 },
  { slug: "facilities", label: "Facility Rental", emoji: "🏟", sort_order: 9 },
  { slug: "travel", label: "Travel Services", emoji: "✈️", sort_order: 10 },
  { slug: "education", label: "Education", emoji: "🎓", sort_order: 11 },
  { slug: "events", label: "Event Services", emoji: "🎟", sort_order: 12 },
];

export function slugifyCategory(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function hasMobileCategorySeeds(rows: { slug?: string | null }[]) {
  const slugs = new Set(rows.map((row) => row.slug).filter(Boolean));
  return mobileServiceCategories.every((seed) => slugs.has(seed.slug));
}
