import { redirect } from "next/navigation";

/** Legacy route — replaced by People directory. */
export default function UsersRedirectPage() {
  redirect("/admin/people");
}
