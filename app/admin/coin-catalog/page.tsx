"use client";

import { useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import { deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase/client";
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
  const [etbPerCoin, setEtbPerCoin] = useState("0.10");
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
    const supabase = getSupabase();
    const [packRes, giftRes, settingsRes] = await Promise.all([
      supabase.from("coin_packages").select("*").order("sort_order"),
      supabase.from("coin_gifts").select("*").order("sort_order"),
      supabase.from("coin_settings").select("etb_per_coin").eq("id", 1).maybeSingle(),
    ]);
    if (packRes.error) throw packRes.error;
    if (giftRes.error) throw giftRes.error;
    setPackages((packRes.data ?? []) as CoinPackageRow[]);
    setGifts((giftRes.data ?? []) as CoinGiftRow[]);
    if (settingsRes.data?.etb_per_coin != null) {
      setEtbPerCoin(String(settingsRes.data.etb_per_coin));
    }
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
    try {
      await postAdmin("/api/admin/coin-settings", {
        etb_per_coin: Number(etbPerCoin),
      });
      setNotice("Redemption rate saved.");
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

  return (
    <>
      <AdminPageHeader
        title="Coin catalog"
        description="Buy packs, gift stickers, and redemption ETB rate"
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <section className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 font-heading text-sm font-semibold">Redemption rate</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-text-secondary">ETB per coin</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={etbPerCoin}
              disabled={!canWrite}
              onChange={(e) => setEtbPerCoin(e.target.value)}
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
    </>
  );
}
