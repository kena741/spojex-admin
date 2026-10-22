import { redirect } from "next/navigation";

/** Wallets live under Finance → Wallets & Ledgers. */
export default function WalletsRedirectPage() {
  redirect("/admin/finance/wallets");
}
