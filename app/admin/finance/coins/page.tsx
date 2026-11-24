"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminReloadButton,
  AdminTableLoading,
  AdminTableShell,
} from "@/components/admin-layout";
import { EmojiPickerField } from "@/components/emoji-picker-field";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { adminFetch, deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { cn } from "@/lib/utils";

type TabId = "packs" | "gifts" | "rates";

const TABS: { id: TabId; label: string }[] = [
  { id: "packs", label: "Coin packs" },
  { id: "gifts", label: "Gift catalog" },
  { id: "rates", label: "Rates & rules" },
];

type CoinPackageRow = {
  id: string;
  name: string;
  coins: number;
  bonus_coins: number;
  price_etb: number;
  sort_order: number;
  is_active: boolean;
};

type CoinGiftRow = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  coin_value: number;
  sort_order: number;
  is_active: boolean;
};

type ChapaStatus = {
  enabled: boolean;
  hasPublicKey: boolean;
  hasSecretKey: boolean;
};

type CatalogBundle = {
  packages: CoinPackageRow[];
  gifts: CoinGiftRow[];
  chapa: ChapaStatus;
  settings: Record<string, unknown> | null;
};

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary disabled:opacity-60";
const buttonClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseTab(raw: string | null): TabId {
  if (raw === "gifts" || raw === "rates" || raw === "packs") return raw;
  if (raw === "packages" || raw === "settings") {
    return raw === "packages" ? "packs" : "rates";
  }
  return "packs";
}

async function fetchCatalogBundle(): Promise<CatalogBundle> {
  const spojex = getSpojexClient();
  const [packRes, giftRes, settingsHttp, appSettingsRes] = await Promise.all([
    spojex.from("coin_packages").select("*").order("sort_order"),
    spojex.from("coin_gifts").select("*").order("sort_order"),
    adminFetch("/api/admin/coin-settings"),
    spojex.from("app_settings").select("id,data").eq("id", "payment").maybeSingle(),
  ]);
  if (packRes.error) throw packRes.error;
  if (giftRes.error) throw giftRes.error;

  let settings: Record<string, unknown> | null = null;
  if (settingsHttp.ok) {
    settings = (await settingsHttp.json()) as Record<string, unknown>;
  } else {
    const fallback = await spojex
      .from("coin_settings")
      .select(
        "etb_per_coin,min_redemption_coins,max_redemption_coins,max_pending_redemptions",
      )
      .eq("id", 1)
      .maybeSingle();
    if (fallback.data) settings = fallback.data as Record<string, unknown>;
  }

  const paymentData =
    appSettingsRes.data?.data &&
    typeof appSettingsRes.data.data === "object" &&
    !Array.isArray(appSettingsRes.data.data)
      ? (appSettingsRes.data.data as Record<string, unknown>)
      : {};
  const chapaCfg =
    paymentData.chapa && typeof paymentData.chapa === "object"
      ? (paymentData.chapa as Record<string, unknown>)
      : {};

  return {
    packages: (packRes.data ?? []) as CoinPackageRow[],
    gifts: (giftRes.data ?? []) as CoinGiftRow[],
    chapa: {
      enabled: Boolean(chapaCfg.enable || chapaCfg.isActive),
      hasPublicKey: Boolean(String(chapaCfg.publicKey || "").trim()),
      hasSecretKey: Boolean(
        chapaCfg.secretConfigured === true || String(chapaCfg.secretKey || "").trim(),
      ),
    },
    settings,
  };
}

export default function FinanceCoinsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab") ?? searchParams.get("focus"));
  const { can } = useAdminPermissions();
  const canWrite = can("coins:write") || can("donations:write");

  const [coinsPerBirr, setCoinsPerBirr] = useState("10");
  const [minRedeem, setMinRedeem] = useState("100");
  const [maxRedeem, setMaxRedeem] = useState("50000");
  const [maxPending, setMaxPending] = useState("3");
  const [actionError, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [packName, setPackName] = useState("");
  const [packCoins, setPackCoins] = useState("100");
  const [packBonus, setPackBonus] = useState("0");

  const [giftName, setGiftName] = useState("");
  const [giftEmoji, setGiftEmoji] = useState("🎁");
  const [giftCoins, setGiftCoins] = useState("10");

  const applySettingsPayload = (raw: Record<string, unknown> | null | undefined) => {
    if (!raw) return;
    const etb = Number(raw.etb_per_coin);
    if (Number.isFinite(etb) && etb > 0) {
      const perBirr = 1 / etb;
      setCoinsPerBirr(Number.isInteger(perBirr) ? String(perBirr) : perBirr.toFixed(2));
    }
    if (raw.min_redemption_coins != null) {
      setMinRedeem(String(Number(raw.min_redemption_coins) || 100));
    }
    if (raw.max_redemption_coins != null) {
      setMaxRedeem(String(Number(raw.max_redemption_coins) || 0));
    }
    if (raw.max_pending_redemptions != null) {
      setMaxPending(String(Number(raw.max_pending_redemptions) || 3));
    }
  };

  const {
    data: bundle,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<CatalogBundle>({
    key: adminCacheKey(["finance", "coins", "catalog"]),
    fetcher: fetchCatalogBundle,
  });
  const error = actionError ?? loadError;
  const packages = bundle?.packages ?? [];
  const gifts = bundle?.gifts ?? [];
  const chapa: ChapaStatus = bundle?.chapa ?? {
    enabled: false,
    hasPublicKey: false,
    hasSecretKey: false,
  };

  useEffect(() => {
    if (bundle) applySettingsPayload(bundle.settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle]);

  const setTab = (id: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    params.set("tab", id);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const load = async () => {
    await refresh();
  };

  const etbPerCoin = (() => {
    const perBirr = Number(coinsPerBirr);
    return Number.isFinite(perBirr) && perBirr > 0 ? 1 / perBirr : 0.1;
  })();

  const priceForCoins = (coins: number) =>
    Math.round(Math.max(0, coins) * etbPerCoin * 100) / 100;

  const syncPackPrices = async (rateEtbPerCoin: number) => {
    for (const row of packages) {
      const next = Math.round(row.coins * rateEtbPerCoin * 100) / 100;
      if (Math.abs(Number(row.price_etb) - next) < 0.005) continue;
      await patchAdmin(`/api/admin/coin-packages/${row.id}`, { price_etb: next });
    }
  };

  const saveRate = async () => {
    if (!canWrite) return;
    setError(null);
    setNotice(null);
    const perBirr = Number(coinsPerBirr);
    if (!Number.isFinite(perBirr) || perBirr <= 0) {
      setError("Coins per Birr must be greater than 0.");
      return;
    }
    try {
      await postAdmin("/api/admin/coin-settings", { coins_per_birr: perBirr });
      const rate = 1 / perBirr;
      await syncPackPrices(rate);
      setNotice(`Saved: 1 Birr = ${perBirr} coins. Pack prices updated.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save rate");
    }
  };

  const saveRedeemLimits = async () => {
    if (!canWrite) return;
    setError(null);
    setNotice(null);
    const min = Number(minRedeem);
    const max = Number(maxRedeem);
    const pending = Number(maxPending);
    if (!Number.isFinite(min) || min < 1) {
      setError("Minimum redeem coins must be at least 1.");
      return;
    }
    if (!Number.isFinite(max) || max < 0) {
      setError("Maximum redeem coins must be 0 (unlimited) or greater.");
      return;
    }
    if (max > 0 && min > max) {
      setError("Minimum cannot exceed maximum redemption.");
      return;
    }
    if (!Number.isFinite(pending) || pending < 1) {
      setError("Max pending redemptions must be at least 1.");
      return;
    }
    try {
      await postAdmin("/api/admin/coin-settings", {
        min_redemption_coins: Math.floor(min),
        max_redemption_coins: Math.floor(max),
        max_pending_redemptions: Math.floor(pending),
      });
      setNotice(
        `Saved redeem limits: min ${Math.floor(min)}, max ${
          max > 0 ? Math.floor(max) : "unlimited"
        }, pending ${Math.floor(pending)}.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save redeem limits");
    }
  };

  const createPackage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setError(null);
    try {
      const coins = Number(packCoins) || 0;
      await postAdmin("/api/admin/coin-packages", {
        name: packName.trim(),
        coins,
        bonus_coins: Number(packBonus) || 0,
        price_etb: priceForCoins(coins),
        sort_order: packages.length + 1,
      });
      setPackName("");
      setPackCoins("100");
      setPackBonus("0");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create package failed");
    }
  };

  const createGift = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setError(null);
    try {
      await postAdmin("/api/admin/coin-gifts", {
        name: giftName.trim(),
        slug: slugify(giftName),
        emoji: giftEmoji.trim(),
        coin_value: Number(giftCoins) || 0,
        sort_order: gifts.length + 1,
      });
      setGiftName("");
      setGiftEmoji("🎁");
      setGiftCoins("10");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create gift failed");
    }
  };

  const seedStarterCatalog = async () => {
    if (!canWrite) return;
    setError(null);
    setNotice(null);
    try {
      if (packages.length === 0) {
        for (const pack of [
          { name: "Starter", coins: 500, bonus_coins: 0, sort_order: 10 },
          { name: "Popular", coins: 1000, bonus_coins: 20, sort_order: 20 },
          { name: "Fan Pack", coins: 2500, bonus_coins: 50, sort_order: 30 },
        ]) {
          await postAdmin("/api/admin/coin-packages", {
            ...pack,
            price_etb: priceForCoins(pack.coins),
          });
        }
      }
      if (gifts.length === 0) {
        for (const gift of [
          { name: "Clap", slug: "clap", emoji: "👏", coin_value: 5, sort_order: 10 },
          { name: "Fire", slug: "fire", emoji: "🔥", coin_value: 15, sort_order: 20 },
          { name: "Trophy", slug: "trophy", emoji: "🏆", coin_value: 50, sort_order: 30 },
        ]) {
          await postAdmin("/api/admin/coin-gifts", gift);
        }
      }
      setNotice("Starter packs and gifts added.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not seed catalog");
    }
  };

  const needsSeed = packages.length === 0 || gifts.length === 0;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Coins & Gifts"
        description="Configure packs, gifts, and exchange rates"
        breadcrumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Coins & Gifts" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => {
                setError(null);
                void refresh();
              }}
            />
            {canWrite && needsSeed ? (
              <button type="button" onClick={() => void seedStarterCatalog()} className={primaryButtonClass}>
                Seed starters
              </button>
            ) : null}
            <Link
              href="/admin/finance/transactions?module=coins&view=business&asset=money"
              className={buttonClass}
            >
              Purchases
            </Link>
            <Link href="/admin/finance/payouts?type=coin_redemption" className={buttonClass}>
              Redemptions
            </Link>
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
          <button type="button" className="ml-2 underline" onClick={() => setNotice(null)}>
            dismiss
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-border pb-px">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              tab === item.id
                ? "border-primary font-medium text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "packs" ? (
        <section className="space-y-4">
          {canWrite ? (
            <form onSubmit={createPackage} className="grid gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
              <input
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
                placeholder="Pack name"
                required
                className={inputClass}
              />
              <input
                value={packCoins}
                onChange={(e) => setPackCoins(e.target.value)}
                placeholder="Coins"
                type="number"
                min={1}
                className={inputClass}
              />
              <input
                value={packBonus}
                onChange={(e) => setPackBonus(e.target.value)}
                placeholder="Bonus (free)"
                type="number"
                min={0}
                className={inputClass}
              />
              <div className="flex h-10 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm text-text-secondary">
                ETB {priceForCoins(Number(packCoins) || 0)}
              </div>
              <button type="submit" className={primaryButtonClass}>
                Add pack
              </button>
            </form>
          ) : null}
          <AdminTableShell>
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Coins</th>
                  <th className="px-3 py-2">ETB</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <AdminTableLoading colSpan={5} label="Loading packs…" />
                ) : packages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <AdminEmpty title="No packs yet" description="Add a pack or seed starters." />
                    </td>
                  </tr>
                ) : (
                  packages.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2">
                        {row.coins}
                        {row.bonus_coins > 0 ? ` +${row.bonus_coins}` : ""}
                      </td>
                      <td className="px-3 py-2">
                        {priceForCoins(row.coins)}
                        {Math.abs(Number(row.price_etb) - priceForCoins(row.coins)) > 0.01 ? (
                          <span className="ml-1 text-xs text-text-secondary">(stored {row.price_etb})</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            row.is_active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-text-secondary",
                          )}
                        >
                          {row.is_active ? "Active" : "Off"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canWrite ? (
                          <div className="flex justify-end gap-3">
                            <button
                              type="button"
                              className="text-xs font-medium text-primary"
                              onClick={() =>
                                void patchAdmin(`/api/admin/coin-packages/${row.id}`, {
                                  is_active: !row.is_active,
                                }).then(load)
                              }
                            >
                              {row.is_active ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              className="text-xs font-medium text-red-600"
                              onClick={() => void deleteAdmin(`/api/admin/coin-packages/${row.id}`).then(load)}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </AdminTableShell>
        </section>
      ) : null}

      {tab === "gifts" ? (
        <section className="space-y-4">
          {canWrite ? (
            <form onSubmit={createGift} className="grid gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
              <EmojiPickerField value={giftEmoji} onChange={setGiftEmoji} />
              <input
                value={giftName}
                onChange={(e) => setGiftName(e.target.value)}
                placeholder="Gift name"
                required
                className={cn(inputClass, "lg:col-span-1")}
              />
              <input
                value={giftCoins}
                onChange={(e) => setGiftCoins(e.target.value)}
                placeholder="Coin value"
                type="number"
                min={1}
                className={inputClass}
              />
              <button type="submit" className={primaryButtonClass}>
                Add gift
              </button>
            </form>
          ) : null}
          <AdminTableShell>
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-3 py-2">Gift</th>
                  <th className="px-3 py-2">Coins</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <AdminTableLoading colSpan={4} label="Loading gifts…" />
                ) : gifts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-0">
                      <AdminEmpty title="No gifts yet" description="Add a gift or seed starters." />
                    </td>
                  </tr>
                ) : (
                  gifts.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {row.emoji} {row.name}
                      </td>
                      <td className="px-3 py-2">{row.coin_value}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            row.is_active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-text-secondary",
                          )}
                        >
                          {row.is_active ? "Active" : "Off"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canWrite ? (
                          <div className="flex justify-end gap-3">
                            <button
                              type="button"
                              className="text-xs font-medium text-primary"
                              onClick={() =>
                                void patchAdmin(`/api/admin/coin-gifts/${row.id}`, {
                                  is_active: !row.is_active,
                                }).then(load)
                              }
                            >
                              {row.is_active ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              className="text-xs font-medium text-red-600"
                              onClick={() => void deleteAdmin(`/api/admin/coin-gifts/${row.id}`).then(load)}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </AdminTableShell>
        </section>
      ) : null}

      {tab === "rates" ? (
        <section className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-heading text-sm font-semibold">Purchase rate</h2>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-text-secondary">Coins per 1 Birr</span>
                  <input
                    type="number"
                    min={0.01}
                    step="1"
                    value={coinsPerBirr}
                    disabled={!canWrite}
                    onChange={(e) => setCoinsPerBirr(e.target.value)}
                    className={cn(inputClass, "w-40")}
                  />
                </label>
                {canWrite ? (
                  <button type="button" onClick={() => void saveRate()} className={primaryButtonClass}>
                    Save rate
                  </button>
                ) : null}
              </div>
              {Number(coinsPerBirr) > 0 ? (
                <p className="mt-2 text-xs text-text-secondary">
                  Example: 2 Birr → {Math.floor(2 * Number(coinsPerBirr))} coins · 1 coin ={" "}
                  {(1 / Number(coinsPerBirr)).toFixed(2)} ETB
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-heading text-sm font-semibold">Redemption limits</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-sm">
                  <span className="mb-1 block text-text-secondary">Min / request</span>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={minRedeem}
                    disabled={!canWrite}
                    onChange={(e) => setMinRedeem(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-text-secondary">Max (0 = unlimited)</span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={maxRedeem}
                    disabled={!canWrite}
                    onChange={(e) => setMaxRedeem(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-text-secondary">Max pending</span>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={maxPending}
                    disabled={!canWrite}
                    onChange={(e) => setMaxPending(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
              {canWrite ? (
                <button type="button" onClick={() => void saveRedeemLimits()} className={cn(primaryButtonClass, "mt-4")}>
                  Save limits
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-sm font-semibold">Chapa checkout</h2>
              </div>
              <Link href="/admin/finance/payment-settings" className={buttonClass}>
                Payment settings
              </Link>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-text-secondary">Status</dt>
                <dd className={chapa.enabled ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                  {chapa.enabled ? "Enabled" : "Disabled"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-secondary">Public key</dt>
                <dd>{chapa.hasPublicKey ? "Set" : "Missing"}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-secondary">Secret key</dt>
                <dd>{chapa.hasSecretKey ? "Set" : "Missing"}</dd>
              </div>
            </dl>
          </div>
        </section>
      ) : null}
    </div>
  );
}
