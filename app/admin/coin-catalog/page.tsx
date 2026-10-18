"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import { deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";

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

type CoinPurchaseRow = {
  id: string;
  user_id: string;
  coins: number;
  price_etb: number;
  status: string;
  provider_ref: string;
  paid_at: string | null;
  created_at: string;
};

type ChapaStatus = {
  enabled: boolean;
  hasPublicKey: boolean;
  hasSecretKey: boolean;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function CoinCatalogPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("donations:write");
  const [packages, setPackages] = useState<CoinPackageRow[]>([]);
  const [gifts, setGifts] = useState<CoinGiftRow[]>([]);
  const [purchases, setPurchases] = useState<CoinPurchaseRow[]>([]);
  const [chapa, setChapa] = useState<ChapaStatus>({
    enabled: false,
    hasPublicKey: false,
    hasSecretKey: false,
  });
  /** Primary admin knob: how many coins 1 Birr buys (default 10). */
  const [coinsPerBirr, setCoinsPerBirr] = useState("10");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [packName, setPackName] = useState("");
  const [packCoins, setPackCoins] = useState("100");
  const [packBonus, setPackBonus] = useState("0");
  const [packPrice, setPackPrice] = useState("50");

  const [giftName, setGiftName] = useState("");
  const [giftEmoji, setGiftEmoji] = useState("🎁");
  const [giftCoins, setGiftCoins] = useState("10");

  const load = async () => {
    const spojex = getSpojexClient();
    const [packRes, giftRes, settingsRes, purchaseRes, appSettingsRes] =
      await Promise.all([
        spojex.from("coin_packages").select("*").order("sort_order"),
        spojex.from("coin_gifts").select("*").order("sort_order"),
        spojex.from("coin_settings").select("etb_per_coin").eq("id", 1).maybeSingle(),
        spojex
          .from("coin_purchases")
          .select("id,user_id,coins,price_etb,status,provider_ref,paid_at,created_at")
          .order("created_at", { ascending: false })
          .limit(25),
        spojex.from("app_settings").select("id,data").eq("id", "payment").maybeSingle(),
      ]);
    if (packRes.error) throw packRes.error;
    if (giftRes.error) throw giftRes.error;
    setPackages((packRes.data ?? []) as CoinPackageRow[]);
    setGifts((giftRes.data ?? []) as CoinGiftRow[]);
    if (!purchaseRes.error) {
      setPurchases((purchaseRes.data ?? []) as CoinPurchaseRow[]);
    }
    if (settingsRes.data?.etb_per_coin != null) {
      const etb = Number(settingsRes.data.etb_per_coin);
      if (Number.isFinite(etb) && etb > 0) {
        const perBirr = 1 / etb;
        setCoinsPerBirr(
          Number.isInteger(perBirr) ? String(perBirr) : perBirr.toFixed(2),
        );
      }
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
    setChapa({
      enabled: Boolean(chapaCfg.enable || chapaCfg.isActive),
      hasPublicKey: Boolean(String(chapaCfg.publicKey || "").trim()),
      hasSecretKey: Boolean(String(chapaCfg.secretKey || "").trim()),
    });
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

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
      await postAdmin("/api/admin/coin-settings", {
        coins_per_birr: perBirr,
      });
      setNotice(`Saved: 1 Birr = ${perBirr} coins (used after every Chapa payment).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save rate");
    }
  };

  const createPackage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setError(null);
    try {
      await postAdmin("/api/admin/coin-packages", {
        name: packName.trim(),
        coins: Number(packCoins) || 0,
        bonus_coins: Number(packBonus) || 0,
        price_etb: Number(packPrice) || 0,
        sort_order: packages.length + 1,
      });
      setPackName("");
      setPackCoins("100");
      setPackBonus("0");
      setPackPrice("50");
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
        const starters = [
          { name: "Starter", coins: 50, bonus_coins: 0, price_etb: 50, sort_order: 10 },
          { name: "Popular", coins: 120, bonus_coins: 20, price_etb: 100, sort_order: 20 },
          { name: "Fan Pack", coins: 300, bonus_coins: 50, price_etb: 250, sort_order: 30 },
        ];
        for (const pack of starters) {
          await postAdmin("/api/admin/coin-packages", pack);
        }
      }
      if (gifts.length === 0) {
        const starters = [
          { name: "Clap", slug: "clap", emoji: "👏", coin_value: 5, sort_order: 10 },
          { name: "Fire", slug: "fire", emoji: "🔥", coin_value: 15, sort_order: 20 },
          { name: "Trophy", slug: "trophy", emoji: "🏆", coin_value: 50, sort_order: 30 },
        ];
        for (const gift of starters) {
          await postAdmin("/api/admin/coin-gifts", gift);
        }
      }
      setNotice("Starter coin packs and gifts are ready for mobile donations.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not seed catalog");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Coin catalog"
        description="Chapa buy packs for the app, gift stickers, and redemption ETB rate"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/finance/payment-settings"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Chapa payment settings
            </Link>
            {canWrite && (packages.length === 0 || gifts.length === 0) ? (
              <button
                type="button"
                onClick={() => void seedStarterCatalog()}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Seed starter catalog
              </button>
            ) : null}
          </div>
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <section className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="mb-1 font-heading text-sm font-semibold">Chapa coin purchases</h2>
            <p className="text-sm text-text-secondary">
              Active packs are sold in the mobile wallet via Chapa. Configure keys under Payment
              Settings, then users pay ETB and receive purchased coins.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
            <div>
              Status:{" "}
              <span className={chapa.enabled ? "text-emerald-700" : "text-amber-700"}>
                {chapa.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div>Public key: {chapa.hasPublicKey ? "set" : "missing"}</div>
            <div>Secret key: {chapa.hasSecretKey ? "set" : "missing"}</div>
          </div>
        </div>
        {!chapa.enabled || !chapa.hasPublicKey || !chapa.hasSecretKey ? (
          <p className="mt-3 text-sm text-amber-800">
            Turn on Chapa and save public + secret keys so in-app coin buy can verify payments.
          </p>
        ) : null}
      </section>

      <section className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 font-heading text-sm font-semibold">Coin ↔ Birr rate</h2>
        <p className="mb-3 text-sm text-text-secondary">
          After a successful Chapa payment, coins credited = paid Birr × this rate
          (plus any pack bonus).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-text-secondary">Coins per 1 Birr</span>
            <input
              type="number"
              min={0.01}
              step="1"
              value={coinsPerBirr}
              disabled={!canWrite}
              onChange={(e) => setCoinsPerBirr(e.target.value)}
              className="h-10 w-40 rounded-lg border border-border px-3"
            />
          </label>
          {canWrite ? (
            <button
              type="button"
              onClick={() => void saveRate()}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
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
      </section>

      {loading ? <AdminLoadingRow label="Loading catalog…" /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 font-heading text-sm font-semibold">Coin packs</h2>
          {canWrite ? (
            <form onSubmit={createPackage} className="mb-4 grid gap-2 md:grid-cols-2">
              <input
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
                placeholder="Pack name"
                required
                className="h-10 rounded-lg border border-border px-3 text-sm"
              />
              <input
                value={packPrice}
                onChange={(e) => setPackPrice(e.target.value)}
                placeholder="Price ETB"
                type="number"
                min={0}
                className="h-10 rounded-lg border border-border px-3 text-sm"
              />
              <input
                value={packCoins}
                onChange={(e) => setPackCoins(e.target.value)}
                placeholder="Coins"
                type="number"
                min={1}
                className="h-10 rounded-lg border border-border px-3 text-sm"
              />
              <input
                value={packBonus}
                onChange={(e) => setPackBonus(e.target.value)}
                placeholder="Bonus"
                type="number"
                min={0}
                className="h-10 rounded-lg border border-border px-3 text-sm"
              />
              <button
                type="submit"
                className="h-10 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground md:col-span-2"
              >
                Add pack
              </button>
            </form>
          ) : null}
          <AdminTableShell>
            {packages.length === 0 ? (
              <AdminEmpty title="No packs" description="Add Chapa buy packs." />
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Coins</th>
                    <th className="px-3 py-2">ETB</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {packages.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {row.name}
                        {!row.is_active ? (
                          <span className="ml-2 text-xs text-text-secondary">off</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {row.coins}
                        {row.bonus_coins > 0 ? ` +${row.bonus_coins}` : ""}
                      </td>
                      <td className="px-3 py-2">{row.price_etb}</td>
                      <td className="px-3 py-2 text-right">
                        {canWrite ? (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="text-xs text-primary"
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
                              className="text-xs text-red-600"
                              onClick={() =>
                                void deleteAdmin(`/api/admin/coin-packages/${row.id}`).then(load)
                              }
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </AdminTableShell>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 font-heading text-sm font-semibold">Gift catalog</h2>
          {canWrite ? (
            <form onSubmit={createGift} className="mb-4 grid gap-2 md:grid-cols-3">
              <input
                value={giftEmoji}
                onChange={(e) => setGiftEmoji(e.target.value)}
                placeholder="Emoji"
                className="h-10 rounded-lg border border-border px-3 text-sm"
              />
              <input
                value={giftName}
                onChange={(e) => setGiftName(e.target.value)}
                placeholder="Gift name"
                required
                className="h-10 rounded-lg border border-border px-3 text-sm md:col-span-2"
              />
              <input
                value={giftCoins}
                onChange={(e) => setGiftCoins(e.target.value)}
                placeholder="Coin value"
                type="number"
                min={1}
                className="h-10 rounded-lg border border-border px-3 text-sm md:col-span-2"
              />
              <button
                type="submit"
                className="h-10 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                Add gift
              </button>
            </form>
          ) : null}
          <AdminTableShell>
            {gifts.length === 0 ? (
              <AdminEmpty title="No gifts" description="Add emoji gifts fans can send." />
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-3 py-2">Gift</th>
                    <th className="px-3 py-2">Coins</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {gifts.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {row.emoji} {row.name}
                        {!row.is_active ? (
                          <span className="ml-2 text-xs text-text-secondary">off</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{row.coin_value}</td>
                      <td className="px-3 py-2 text-right">
                        {canWrite ? (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="text-xs text-primary"
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
                              className="text-xs text-red-600"
                              onClick={() =>
                                void deleteAdmin(`/api/admin/coin-gifts/${row.id}`).then(load)
                              }
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </AdminTableShell>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 font-heading text-sm font-semibold">Recent Chapa purchases</h2>
        <AdminTableShell>
          {purchases.length === 0 ? (
            <AdminEmpty
              title="No purchases yet"
              description="Completed and pending coin buys from the app appear here."
            />
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Coins</th>
                  <th className="px-3 py-2">ETB</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Tx ref</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text-secondary">
                      {row.paid_at || row.created_at
                        ? new Date(row.paid_at || row.created_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 font-medium">{row.coins}</td>
                    <td className="px-3 py-2">{row.price_etb}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="max-w-[12rem] truncate px-3 py-2 font-mono text-xs">
                      {row.provider_ref || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminTableShell>
      </section>
    </>
  );
}
