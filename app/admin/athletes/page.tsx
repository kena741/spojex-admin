import { redirect } from "next/navigation";

/** Legacy route - Identity hub uses People with profile filter. */
export default function AthletesRedirectPage() {
  redirect("/admin/people?profile=athlete");
}
