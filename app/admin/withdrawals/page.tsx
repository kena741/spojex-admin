import { redirect } from "next/navigation";

/** Legacy route — unified under Finance → Payouts. */
export default function WithdrawalsRedirectPage() {
  redirect("/admin/finance/payouts?type=withdrawal");
}
