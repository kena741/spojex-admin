import { redirect } from "next/navigation";

/** Live events list lives under Streams → Live Events tab. */
export default function LiveEventsRedirectPage() {
  redirect("/admin/streams?tab=live");
}
