"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "packs", label: "Coin packs", href: "/admin/coin-catalog?focus=packages" },
  { id: "gifts", label: "Gift catalog", href: "/admin/coin-catalog?focus=gifts" },
  { id: "rates", label: "Rates & rules", href: "/admin/coin-catalog?focus=settings" },
] as const;

/**
 * Coins & Gifts hub — organizes catalog configuration and deep-links into the
 * existing coin catalog editor. Purchase history lives under Transactions.
 */
export default function FinanceCoinsHubPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "packs";

  useEffect(() => {
    // Default: send to catalog with focus, keep hub as landing with shortcuts.
  }, []);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Coins & Gifts"
        description="Configure packs, gifts, and rates — purchases appear in Transactions"
        actions={
          <Link
            href="/admin/finance/transactions?module=coins&type=customer_payment&asset=money"
            className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium"
          >
            View coin purchases
          </Link>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => router.replace(`${pathname}?tab=${t.id}`)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium",
              tab === t.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-text-secondary hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <HubCard
          title="Coin packs"
          body="Base coins, bonus coins, purchase price, and active status. Effective pricing is saved on each purchase."
          href="/admin/coin-catalog"
        />
        <HubCard
          title="Gift catalog"
          body="Gift previews, coin cost, and active status for live tipping."
          href="/admin/coin-catalog"
        />
        <HubCard
          title="Rates & redemption rules"
          body="Purchase rate and redemption rate are separate. Changing settings does not reprice historical purchases or pending redemptions."
          href="/admin/coin-catalog"
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
        <h2 className="font-heading text-sm font-semibold">Operational queues</h2>
        <ul className="mt-3 space-y-2 text-xs text-text-secondary">
          <li>
            <Link href="/admin/finance/payouts?type=coin_redemption" className="text-primary hover:underline">
              Coin redemption payouts
            </Link>{" "}
            — creator cash-outs from redeemable coin balances
          </li>
          <li>
            <Link
              href="/admin/finance/transactions?module=coins&status=pending"
              className="text-primary hover:underline"
            >
              Pending coin purchases
            </Link>{" "}
            — verify against Chapa before marking failed; late payments may still settle
          </li>
        </ul>
      </section>
    </div>
  );
}

function HubCard({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <p className="font-heading text-sm font-semibold">{title}</p>
      <p className="mt-2 text-xs text-text-secondary">{body}</p>
      <p className="mt-3 text-xs font-medium text-primary">Open editor →</p>
    </Link>
  );
}
