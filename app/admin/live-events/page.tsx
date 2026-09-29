import { redirect } from "next/navigation";

/** Live events list lives under Streams → Video tab. */
export default function LiveEventsRedirectPage() {
  redirect("/admin/streams?tab=video");
}
