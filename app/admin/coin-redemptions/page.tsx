import { redirect } from "next/navigation";

/** Legacy route - unified under Finance → Payouts. */
export default function CoinRedemptionsRedirectPage() {
  redirect("/admin/finance/payouts?type=coin_redemption");
}
