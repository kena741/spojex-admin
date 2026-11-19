"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminEmpty, AdminErrorAlert, AdminLoadingRow, AdminStatCard } from "@/components/admin-layout";
import { ChartCard, SeriesAreaChart } from "@/components/analytics/charts";
import { StatusBadge } from "@/components/status-badge";
import { eventStatusLabel, formatNumber, formatWhen, statusTone, type AwardEventStatus } from "@/lib/awards";
import { adminFetch } from "@/lib/hooks";

// Revenue from vote purchases. Money comes only from completed payments; a
// nominee's revenue is the paid votes cast for them, each valued at what that
// voter paid per vote. Bought votes not used yet are shown as "unused", so
// nominees + unused add up to the event's revenue.

export type EventRevenueRow = {
  event_id: string;
  title: string;
  status: AwardEventStatus;
  results_published?: boolean;
  revenue: number;
  payments: number;
  buyers: number;
  votes_sold: number;
  paid_votes_cast: number;
  unused_votes: number;
  allocated: number;
  unallocated: number;
  avg_price_per_vote: number;
  currency: string;
  last_paid_at: string | null;
};

export type RevenueOverview = {
  events: EventRevenueRow[];
  totals: {
    revenue: number;
    payments: number;
    votes_sold: number;
    paid_votes_cast: number;
    events_with_revenue: number;
    currency: string;
  };
};

export type NomineeRevenueRow = {
  participant_id: string;
  name: string;
  photo_url: string;
  status: string;
  rank: number;
  total_votes: number;
  free_votes: number;
  paid_votes: number;
  revenue: number;
  share: number;
  paying_voters: number;
};

export type EventRevenue = {
  event: { id: string; title: string; status: string };
  summary: {
    revenue: number;
    payments: number;
    buyers: number;
    votes_sold: number;
    paid_votes_cast: number;
    unused_votes: number;
    allocated: number;
    unallocated: number;
    avg_price_per_vote: number;
    pending_payments: number;
    pending_amount: number;
    currency: string;
  };
  nominees: NomineeRevenueRow[];
  packages: { package_name: string; payments: number; quantity: number; votes: number; revenue: number }[];
  daily: { day: string; payments: number; votes: number; revenue: number }[];
};

export function formatMoney(value: number | string | null | undefined, currency = "ETB") {
  const n = Number(value ?? 0);
  return `${currency} ${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function useRevenue<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      const res = await adminFetch(path);
      const payload = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
      if (cancelled) return;
      if (!res.ok) setError(payload.error || "Could not load revenue");
      else setData(payload.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);
  return { data, error, reload: () => setNonce((n) => n + 1) };
}

const th = "px-4 py-2 font-medium";
const tdNum = "px-4 py-2 text-right tabular-nums";

function Avatar({ url, name }: { url?: string; name: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-text-secondary">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function ShareBar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

// ── All events ──────────────────────────────────────────────────────────────

export function RevenueOverviewPanel({ reloadKey = 0 }: { reloadKey?: number }) {
  const { data, error, reload } = useRevenue<RevenueOverview>("/api/admin/awards/revenue");
  useEffect(() => {
    if (reloadKey) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);
  if (error) return <AdminErrorAlert message={error} />;
  if (!data) return <AdminLoadingRow label="Loading revenue…" />;
  const { totals, events } = data;
  const cur = totals.currency || "ETB";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard title="Total revenue" value={formatMoney(totals.revenue, cur)} />
        <AdminStatCard title="Payments" value={formatNumber(totals.payments)} />
        <AdminStatCard title="Votes sold" value={formatNumber(totals.votes_sold)} />
        <AdminStatCard title="Events earning" value={`${formatNumber(totals.events_with_revenue)} of ${formatNumber(events.length)}`} />
      </div>
      {events.length === 0 ? (
        <AdminEmpty title="No award events yet" description="Revenue shows here once people buy votes." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted text-left text-xs text-text-secondary">
              <tr>
                <th className={th}>Event</th>
                <th className={`${th} text-right`}>Revenue</th>
                <th className={`${th} text-right`}>Payments</th>
                <th className={`${th} text-right`}>Buyers</th>
                <th className={`${th} text-right`}>Votes sold</th>
                <th className={`${th} text-right`}>Used / unused</th>
                <th className={`${th} text-right`}>Avg per vote</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const share = totals.revenue ? (e.revenue * 100) / totals.revenue : 0;
                return (
                  <tr key={e.event_id} className="border-t border-border align-top hover:bg-muted/40">
                    <td className="px-4 py-2">
                      <Link href={`/admin/awards/${e.event_id}?tab=revenue`} className="font-medium text-text-primary hover:text-primary">
                        {e.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                        <StatusBadge tone={statusTone(e.status)}>{eventStatusLabel(e)}</StatusBadge>
                        {e.last_paid_at ? <span>Last payment {formatWhen(e.last_paid_at)}</span> : null}
                      </div>
                    </td>
                    <td className={`${tdNum} font-semibold`}>
                      {formatMoney(e.revenue, e.currency)}
                      {totals.revenue ? (
                        <div className="text-xs font-normal text-text-secondary">{share.toFixed(1)}% of total</div>
                      ) : null}
                    </td>
                    <td className={tdNum}>{formatNumber(e.payments)}</td>
                    <td className={tdNum}>{formatNumber(e.buyers)}</td>
                    <td className={tdNum}>{formatNumber(e.votes_sold)}</td>
                    <td className={tdNum}>
                      {formatNumber(e.paid_votes_cast)} / {formatNumber(e.unused_votes)}
                    </td>
                    <td className={tdNum}>{e.votes_sold ? formatMoney(e.avg_price_per_vote, e.currency) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
              <tr>
                <td className="px-4 py-2">Total</td>
                <td className={tdNum}>{formatMoney(totals.revenue, cur)}</td>
                <td className={tdNum}>{formatNumber(totals.payments)}</td>
                <td className={tdNum} />
                <td className={tdNum}>{formatNumber(totals.votes_sold)}</td>
                <td className={tdNum}>
                  {formatNumber(totals.paid_votes_cast)} / {formatNumber(Math.max(0, totals.votes_sold - totals.paid_votes_cast))}
                </td>
                <td className={tdNum}>{totals.votes_sold ? formatMoney(totals.revenue / totals.votes_sold, cur) : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-text-secondary">
        Completed payments only. Open an event to see its revenue per nominee and per package.
      </p>
    </div>
  );
}

// ── One event ───────────────────────────────────────────────────────────────

export function EventRevenuePanel({ eventId }: { eventId: string }) {
  const { data, error } = useRevenue<EventRevenue>(`/api/admin/awards/events/${eventId}/revenue`);
  if (error) return <AdminErrorAlert message={error} />;
  if (!data) return <AdminLoadingRow label="Loading revenue…" />;
  const s = data.summary;
  const cur = s.currency || "ETB";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard title="Revenue" value={formatMoney(s.revenue, cur)} />
        <AdminStatCard title="Payments" value={`${formatNumber(s.payments)} from ${formatNumber(s.buyers)} buyers`} />
        <AdminStatCard title="Votes sold" value={`${formatNumber(s.votes_sold)} (${formatNumber(s.unused_votes)} unused)`} />
        <AdminStatCard title="Avg per vote" value={s.votes_sold ? formatMoney(s.avg_price_per_vote, cur) : "—"} />
      </div>
      {s.pending_payments > 0 ? (
        <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-text-secondary">
          {formatNumber(s.pending_payments)} payment{s.pending_payments === 1 ? "" : "s"} still pending (
          {formatMoney(s.pending_amount, cur)}), not counted until confirmed.
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Revenue per nominee</h3>
          <span className="text-xs text-text-secondary">Paid votes × what each voter paid per vote</span>
        </div>
        {data.nominees.length === 0 ? (
          <div className="p-4">
            <AdminEmpty title="No nominees" description="Add nominees to this event." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>Nominee</th>
                  <th className={`${th} text-right`}>Revenue</th>
                  <th className={`${th} text-right`}>Paid votes</th>
                  <th className={`${th} text-right`}>Paying voters</th>
                  <th className={`${th} text-right`}>Free votes</th>
                  <th className={`${th} text-right`}>Total votes</th>
                </tr>
              </thead>
              <tbody>
                {data.nominees.map((n) => (
                  <tr key={n.participant_id} className="border-t border-border">
                    <td className="px-4 py-2 font-semibold">{n.revenue > 0 ? n.rank : "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar url={n.photo_url} name={n.name} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{n.name}</div>
                          {n.status !== "approved" ? <div className="text-xs text-text-secondary">{n.status}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className={`${tdNum} w-44 font-semibold`}>
                      {formatMoney(n.revenue, cur)}
                      <div className="text-xs font-normal text-text-secondary">{n.share.toFixed(1)}% of revenue</div>
                      <ShareBar value={n.share} />
                    </td>
                    <td className={tdNum}>{formatNumber(n.paid_votes)}</td>
                    <td className={tdNum}>{formatNumber(n.paying_voters)}</td>
                    <td className={tdNum}>{formatNumber(n.free_votes)}</td>
                    <td className={tdNum}>{formatNumber(n.total_votes)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/50">
                <tr>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2 font-medium">
                    Bought, not used yet
                    <div className="text-xs text-text-secondary">{formatNumber(s.unused_votes)} votes still in voters&apos; wallets</div>
                  </td>
                  <td className={`${tdNum} font-semibold`}>{formatMoney(s.unallocated, cur)}</td>
                  <td colSpan={4} />
                </tr>
                <tr className="border-t border-border font-semibold">
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2">Total</td>
                  <td className={tdNum}>{formatMoney(s.revenue, cur)}</td>
                  <td className={tdNum}>{formatNumber(s.paid_votes_cast)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card">
          <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">Revenue per package</h3>
          {data.packages.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-secondary">No payments yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  <th className={th}>Package</th>
                  <th className={`${th} text-right`}>Payments</th>
                  <th className={`${th} text-right`}>Votes</th>
                  <th className={`${th} text-right`}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.packages.map((p) => (
                  <tr key={p.package_name} className="border-t border-border">
                    <td className="px-4 py-2">{p.package_name}</td>
                    <td className={tdNum}>{formatNumber(p.payments)}</td>
                    <td className={tdNum}>{formatNumber(p.votes)}</td>
                    <td className={`${tdNum} font-medium`}>{formatMoney(p.revenue, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <ChartCard title={`Daily revenue (${cur})`} empty={!data.daily.length}>
          <SeriesAreaChart
            name={cur}
            color="#22c55e"
            data={data.daily.map((d) => ({ date: String(d.day).slice(5, 10), value: Number(d.revenue) }))}
          />
        </ChartCard>
      </div>
    </div>
  );
}
