import { redirect } from "next/navigation";

/** Categories live under marketplace settings; keep the existing editor. */
export default function MarketplaceSettingsPage() {
  redirect("/admin/service-categories");
}
