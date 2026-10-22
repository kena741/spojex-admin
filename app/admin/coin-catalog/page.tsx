import { redirect } from "next/navigation";

/** Coin catalog editor lives under Finance → Coins & Gifts. */
export default function CoinCatalogRedirectPage() {
  redirect("/admin/finance/coins/catalog");
}
