import { redirect } from "next/navigation";

/** Marketplace category settings live under Services → Settings. */
export default function MarketplaceSettingsPage() {
  redirect("/admin/services/settings");
}
