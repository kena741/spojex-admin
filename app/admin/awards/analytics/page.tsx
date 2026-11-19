"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow, AdminReloadButton, AdminStatCard } from "@/components/admin-layout";
import { ChartCard, SeriesAreaChart, SimpleBarChart } from "@/components/analytics/charts";
import { formatNumber, formatWhen, type AwardEventDetail, type AwardEventRow } from "@/lib/awards";
import { adminFetch } from "@/lib/hooks";

type Analytics = {
  counts: { events: number; active_events: number; categories: number; participants: number };
  votes: { total_votes: number; free_votes: number; paid_votes: number; voters: number; vote_requests: number };
  revenue: { revenue: number; payments: number; votes_sold: number; buyers: number };
  per_category: { category_id: string; category_name: string; event_title: string; votes: number; paid_votes: number }[];
  top_participants: {
    participant_id: string;
    name: string;
    category_name: string;
    event_title?: string;
    total_votes: number;
    free_votes: number;
    paid_votes: number;
  }[];
  daily: { day: string; votes: number; revenue: number }[];
  weekly: { week: string; votes: number; voters: number }[];
  payments: {
    id: string;
    amount: number;
    votes: number;
    package_name: string;
    quantity: number;
    provider_ref: string;
    paid_at: string;
    event_title: string;
  }[];
  flags: number;
};

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary sm:w-auto";

function isoDay(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function AwardsAnalyticsPage() {
  const [events, setEvents] = useState<AwardEventRow[]>([]);
  const [detail, setDetail] = useState<AwardEventDetail | null>(null);
  const [eventId, setEventId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [from, setFrom] = useState(isoDay(-30));
  const [to, setTo] = useState(isoDay(0));
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    (async () => {
      const res = await adminFetch("/api/admin/awards/events");
      const payload = (await res.json().catch(() => ({}))) as { data?: { events: AwardEventRow[] } };
      setEvents(payload.data?.events ?? []);
    })();
  }, []);

  useEffect(() => {
    setParticipantId("");
    setDetail(null);
    if (!eventId) return;
    (async () => {
      const res = await adminFetch(`/api/admin/awards/events/${eventId}`);
      const payload = (await res.json().catch(() => ({}))) as { data?: AwardEventDetail };
      setDetail(payload.data ?? null);
    })();
  }, [eventId]);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (eventId) q.set("event_id", eventId);
    if (participantId) q.set("participant_id", participantId);
    if (from) q.set("date_from", new Date(`${from}T00:00:00`).toISOString());
    if (to) q.set("date_to", new Date(`${to}T23:59:59`).toISOString());
    return q.toString();
  }, [eventId, participantId, from, to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const res = await adminFetch(`/api/admin/awards/analytics?${query}`);
      const payload = (await res.json().catch(() => ({}))) as { data?: Analytics; error?: string };
      if (cancelled) return;
      if (!res.ok) setError(payload.error || "Could not load analytics");
      else setData(payload.data ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, nonce]);

  const participants = detail?.participants ?? [];
  return (
    <div>
      <AdminPageHeader
        title="Awards analytics"
        description="Votes, revenue and activity from the vote ledger and confirmed payments."
        backHref="/admin/awards"
        actions={<AdminReloadButton onClick={() => setNonce((n) => n + 1)} refreshing={loading} />}
      />
      <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3">
        <select className={fieldClass} value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">All events</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <select className={fieldClass} value={participantId} disabled={!detail} onChange={(e) => setParticipantId(e.target.value)}>
          <option value="">All participants</option>
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input type="date" className={fieldClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className={fieldClass} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {error ? <AdminErrorAlert message={error} /> : null}
      {loading && !data ? <AdminLoadingRow label="Loading analytics…" /> : null}
      {data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AdminStatCard title="Total votes" value={formatNumber(data.votes.total_votes)} />
            <AdminStatCard title="Free votes" value={formatNumber(data.votes.free_votes)} />
            <AdminStatCard title="Paid votes" value={formatNumber(data.votes.paid_votes)} />
            <AdminStatCard title="Revenue (ETB)" value={Number(data.revenue.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })} />
            <AdminStatCard title="Voters" value={formatNumber(data.votes.voters)} />
            <AdminStatCard title="Payments" value={formatNumber(data.revenue.payments)} />
            <AdminStatCard title="Events (active)" value={`${formatNumber(data.counts.events)} (${formatNumber(data.counts.active_events)})`} />
            <AdminStatCard title="Abuse flags" value={formatNumber(data.flags)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Daily votes" empty={!data.daily.some((d) => Number(d.votes) > 0)}>
              <SeriesAreaChart name="Votes" data={data.daily.map((d) => ({ date: String(d.day).slice(5, 10), value: Number(d.votes) }))} />
            </ChartCard>
            <ChartCard title="Daily revenue (ETB)" empty={!data.daily.some((d) => Number(d.revenue) > 0)}>
              <SeriesAreaChart name="ETB" color="#22c55e" data={data.daily.map((d) => ({ date: String(d.day).slice(5, 10), value: Number(d.revenue) }))} />
            </ChartCard>
            <ChartCard title="Weekly votes" empty={!data.weekly.length}>
              <SimpleBarChart data={data.weekly.map((w) => ({ label: String(w.week).slice(5, 10), value: Number(w.votes) }))} />
            </ChartCard>
            <ChartCard title="Votes per event" empty={!data.per_category.length}>
              <SimpleBarChart data={data.per_category.slice(0, 12).map((c) => ({ label: c.event_title || c.category_name, value: Number(c.votes) }))} />
            </ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card">
              <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">Top participants</h3>
              <table className="w-full text-sm">
                <tbody>
                  {data.top_participants.map((p, i) => (
                    <tr key={`${p.participant_id}-${p.category_name}`} className="border-t border-border first:border-t-0">
                      <td className="w-8 px-4 py-2 font-semibold">{i + 1}</td>
                      <td className="px-4 py-2">
                        {p.name}
                        <div className="text-xs text-text-secondary">{p.event_title ?? p.category_name}</div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatNumber(p.total_votes)}
                        <div className="text-xs text-text-secondary">
                          {formatNumber(p.free_votes)} free · {formatNumber(p.paid_votes)} paid
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="rounded-xl border border-border bg-card">
              <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">Recent confirmed payments</h3>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id} className="border-t border-border first:border-t-0">
                        <td className="px-4 py-2">
                          {p.package_name} × {p.quantity}
                          <div className="text-xs text-text-secondary">
                            {p.event_title} · {formatWhen(p.paid_at)}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          ETB {Number(p.amount).toFixed(2)}
                          <div className="text-xs text-text-secondary">{formatNumber(p.votes)} votes</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
