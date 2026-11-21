import { catalogHasRoleContent, type CatalogProfileDocument } from "@/lib/people/catalog-profile";
import { categoryFor } from "@/lib/catalog";
import type { UserRow } from "@/lib/types";

/** True when the catalog (or role category) has role-specific profile content to show. */
export function hasPersonRoleProfile(
  user: UserRow,
  catalogProfile?: CatalogProfileDocument | null,
): boolean {
  if (catalogHasRoleContent(catalogProfile)) return true;
  const cat = categoryFor(user.role);
  return cat === "athlete" || cat === "professional" || cat === "media";
}
