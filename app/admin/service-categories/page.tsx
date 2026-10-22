import { redirect } from "next/navigation";

/** Categories live under Services → Settings (same pattern as Gyms). */
export default function ServiceCategoriesRedirectPage() {
  redirect("/admin/services/settings");
}
