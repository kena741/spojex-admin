"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "packs", label: "Coin packs", href: "/admin/finance/coins/catalog?focus=packages" },
  { id: "gifts", label: "Gift catalog", href: "/admin/finance/coins/catalog?focus=gifts" },
  { id: "rates", label: "Rates & rules", href: "/admin/finance/coins/catalog?focus=settings" },
] as const;

/**
 * Coins & Gifts hub - catalog configuration. Purchase/gift history stays in Transactions.
 */
export default function FinanceCoinsHubPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "packs";

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Coins & Gifts"
        description="Configure packs, gifts, and rates - purchases and gift transfers appear in Transactions (module filters: coins / gifts)."
        breadcrumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Coins & Gifts" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/finance/transactions?module=coins&view=business&asset=money"
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium"
            >
              Coin purchases
            </Link>
            <Link
              href="/admin/finance/transactions?module=gifts"
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium"
            >
              Gift activity
            </Link>
          </div>
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
          body="Base coins, bonus coins, purchase price, and active status. Effective pricing is snapshotted on each purchase."
          href="/admin/finance/coins/catalog?focus=packages"
        />
        <HubCard
          title="Gift catalog"
          body="Gift previews, coin cost, and active status for chat, radio, live, and campaign tipping."
          href="/admin/finance/coins/catalog?focus=gifts"
        />
        <HubCard
          title="Rates & redemption rules"
          body="Purchase rate and redemption rate are separate. Changing settings does not reprice historical purchases or pending redemptions."
          href="/admin/finance/coins/catalog?focus=settings"
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
        <h2 className="font-heading text-sm font-semibold">Operational history</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Coin purchases, gifts, and redemptions are business/ledger records under Transactions and
          Payouts - not edited here.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/admin/finance/payouts?type=coin_redemption"
            className="text-xs font-medium text-primary hover:underline"
          >
            Coin redemption payouts
          </Link>
          <Link
            href="/admin/finance/reconciliation?issue=missing_coin_issuance"
            className="text-xs font-medium text-primary hover:underline"
          >
            Missing issuance diagnostics
          </Link>
        </div>
      </section>
    </div>
  );
}

function HubCard({
  title,
  body,
  href,
}: {
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <p className="font-heading text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-text-secondary">{body}</p>
      <p className="mt-3 text-xs font-medium text-primary">Open editor →</p>
    </Link>
  );
}
