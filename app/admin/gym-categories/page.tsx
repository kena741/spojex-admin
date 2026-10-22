import { redirect } from "next/navigation";

/** Legacy route - gym category config lives under Gyms → Settings. */
export default function GymCategoriesRedirectPage() {
  redirect("/admin/gyms/settings");
}
