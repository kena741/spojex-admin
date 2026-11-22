"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminEmpty, AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { UserAvatar } from "@/components/user-avatar";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { adminFetch } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { formatCoins, formatDateTime, formatMoney } from "@/lib/utils";

type GiftSender = {
  id: string | null;
  display_name: string;
  username?: string | null;
  avatar_url?: string | null;
};

type GiftRow = {
  id: string;
  created_at: string | null;
  sender: GiftSender;
  is_anonymous: boolean;
  gift: { id: string | null; name: string; emoji: string };
  coins: number;
  etb_value: string;
  credited_user?: { id: string | null; display_name?: string | null };
};

type GiftsPayload = {
  station: { id: string; name: string };
  currency: string;
  etb_per_coin: string;
  totals: {
    gift_count: number;
    coins: number;
    etb_value: string;
    unique_senders: number;
    anonymous_count: number;
    first_at: string | null;
    last_at: string | null;
  };
  by_gift: { gift_name: string; emoji: string; gift_count: number; coins: number; etb_value: string }[];
  top_senders: {
    sender: GiftSender;
    gift_count: number;
    coins: number;
    etb_value: string;
    last_at: string | null;
  }[];
  items: GiftRow[];
  page: number;
  page_size: number;
  total: number;
  error?: string;
};

const PAGE_SIZE = 25;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 font-heading text-lg font-semibold">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-text-secondary">{hint}</p> : null}
    </div>
  );
}

function SenderCell({ sender }: { sender: GiftSender }) {
  const body = (
    <span className="flex items-center gap-2">
      <UserAvatar name={sender.display_name} src={sender.avatar_url} size={26} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{sender.display_name}</span>
        {sender.username ? (
          <span className="block truncate text-xs text-text-secondary">@{sender.username}</span>
        ) : null}
      </span>
    </span>
  );
  if (!sender.id) return body;
  return (
    <Link href={`/admin/users/${sender.id}`} className="hover:underline">
      {body}
    </Link>
  );
}

/** Per-station gift ledger: who sent what, coins / ETB value, when, and totals. */
export function RadioStationGifts({ stationId }: { stationId: string }) {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (q) query.set("q", q);
  const qs = query.toString();

  const { data, loading, error, refreshing } = useAdminQuery<GiftsPayload>({
    key: adminCacheKey(["streams", "gifts", stationId, qs]),
    staleTime: 30_000,
    fetcher: async () => {
      const response = await adminFetch(`/api/admin/streams/${stationId}/gifts?${qs}`);
      const payload = (await response.json().catch(() => ({}))) as GiftsPayload;
      if (!response.ok) throw new Error(payload.error || "Failed to load gifts");
      return payload;
    },
  });

  const totals = data?.totals;
  const pages = data ? Math.max(1, Math.ceil(data.total / (data.page_size || PAGE_SIZE))) : 1;
  const filtered = Boolean(from || to || q);

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm font-semibold">Gifts received</h2>
          <p className="text-xs text-text-secondary">
            Coin gifts listeners sent to this station.
            {data ? ` ETB value at the current rate (${data.etb_per_coin} ETB per coin).` : ""}
          </p>
        </div>
        <form
          className="flex flex-wrap items-end gap-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQ(search.trim());
          }}
        >
          <label className="flex flex-col text-xs text-text-secondary">
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setPage(1);
                setFrom(event.target.value);
              }}
              className="mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <label className="flex flex-col text-xs text-text-secondary">
            To
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setPage(1);
                setTo(event.target.value);
              }}
              className="mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <input
            type="search"
            value={search}
            placeholder="Sender or gift"
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-background"
          >
            Search
          </button>
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setFrom("");
                setTo("");
                setSearch("");
                setQ("");
                setPage(1);
              }}
              className="px-2 py-1.5 text-xs font-medium text-primary hover:underline"
            >
              Clear
            </button>
          ) : null}
        </form>
      </div>

      {error ? <AdminErrorAlert message={error} /> : null}

      {loading && !data ? (
        <AdminLoadingRow label="Loading gifts…" />
      ) : data && totals ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Gifts" value={formatCoins(totals.gift_count)} />
            <Stat label="Coins" value={formatCoins(totals.coins)} />
            <Stat label="ETB value" value={formatMoney(Number(totals.etb_value), data.currency)} />
            <Stat
              label="Senders"
              value={formatCoins(totals.unique_senders)}
              hint={totals.anonymous_count ? `+ ${totals.anonymous_count} anonymous gifts` : undefined}
            />
          </div>

          {data.by_gift.length > 0 || data.top_senders.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  By gift
                </h3>
                <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                  {data.by_gift.map((g) => (
                    <li key={`${g.gift_name}-${g.emoji}`} className="flex items-center justify-between px-3 py-2">
                      <span>
                        <span className="mr-2">{g.emoji || "🎁"}</span>
                        {g.gift_name} <span className="text-text-secondary">× {g.gift_count}</span>
                      </span>
                      <span className="text-right">
                        {formatCoins(g.coins)} coins
                        <span className="block text-xs text-text-secondary">
                          {formatMoney(Number(g.etb_value), data.currency)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Top senders
                </h3>
                {data.top_senders.length === 0 ? (
                  <p className="text-sm text-text-secondary">Only anonymous gifts so far.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                    {data.top_senders.map((s) => (
                      <li key={s.sender.id ?? s.sender.display_name} className="flex items-center justify-between gap-3 px-3 py-2">
                        <SenderCell sender={s.sender} />
                        <span className="shrink-0 text-right">
                          {formatCoins(s.coins)} coins
                          <span className="block text-xs text-text-secondary">
                            {s.gift_count} gift{s.gift_count === 1 ? "" : "s"} ·{" "}
                            {formatMoney(Number(s.etb_value), data.currency)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            {data.items.length === 0 ? (
              <AdminEmpty
                title={filtered ? "No gifts match these filters" : "No gifts yet"}
                description={
                  filtered
                    ? "Try a wider date range or clear the search."
                    : "Gifts listeners send from the live radio room show up here."
                }
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-background text-left text-xs text-text-secondary">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Sender</th>
                    <th className="px-3 py-2 font-medium">Gift</th>
                    <th className="px-3 py-2 text-right font-medium">Coins</th>
                    <th className="px-3 py-2 text-right font-medium">ETB value</th>
                    <th className="px-3 py-2 font-medium">Credited to</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <SenderCell sender={row.sender} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="mr-1.5">{row.gift.emoji || "🎁"}</span>
                        {row.gift.name}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatCoins(row.coins)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {formatMoney(Number(row.etb_value), data.currency)}
                      </td>
                      <td className="px-3 py-2 text-xs text-text-secondary">
                        {row.credited_user?.display_name ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {pages > 1 ? (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-text-secondary">
                Page {data.page} of {pages} · {formatCoins(data.total)} gifts
                {refreshing ? " · refreshing…" : ""}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
