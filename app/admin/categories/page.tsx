import { redirect } from "next/navigation";

/** Legacy route — profile-type config lives under People > Profile settings. */
export default function CategoriesRedirectPage() {
  redirect("/admin/people/settings");
}