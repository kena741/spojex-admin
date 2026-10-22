import { redirect } from "next/navigation";

type Props = { params: Promise<{ userId: string }> };

/** Wallet detail lives under Finance → Wallets & Ledgers. */
export default async function WalletDetailRedirectPage({ params }: Props) {
  const { userId } = await params;
  redirect(`/admin/finance/wallets/${userId}`);
}
