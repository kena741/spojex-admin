"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow, AdminReloadButton, AdminStatCard } from "@/components/admin-layout";
import { SmTabs, fieldClass, labelClass, primaryButtonClass, smGet } from "@/components/sports-market/shared";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { patchAdmin } from "@/lib/hooks";
import { SM_API, etb, type SmOverview, type SmSettings, type SmTopSeller } from "@/lib/sports-market";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";

export default function SportsMarketOverviewPage() {
  const { can } = useAdminPermissions();
  const { data, loading, refreshing, error, refresh } = useAdminQuery<SmOverview>({
    key: adminCacheKey(["sports-market", "overview"]),
    fetcher: () => smGet<SmOverview>("/overview"),
  });
  const o = data;

  return (
    <div>
      <AdminPageHeader
        title="Marketplace"
        description="Buy & sell sports gear — revenue, commission, and order health."
        actions={<AdminReloadButton onClick={refresh} refreshing={refreshing} />}
      />
      <SmTabs />
      {error ? <AdminErrorAlert message={error} /> : null}
      {loading && !o ? <AdminLoadingRow label="Loading marketplace…" /> : null}
      {o ? (
        <>
          <Section title="Revenue">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminStatCard title="Gross sales (GMV)" value={etb(o.gmv)} />
              <AdminStatCard title="Seller earnings" value={etb(o.seller_earnings ?? 0)} />
              <AdminStatCard title="Order volume (paid out)" value={etb(o.order_volume ?? 0)} />
              <AdminStatCard title="Refunded volume" value={etb(o.refunded_volume ?? 0)} />
              <AdminStatCard title="Commission collected" value={etb(o.commission_collected)} />
              <AdminStatCard title="Commission held" value={etb(o.commission_held)} />
              <AdminStatCard title="Cash commission pending" value={etb(o.commission_cod_pending)} />
              <AdminStatCard
                title="Platform take (collected + held)"
                value={etb(o.commission_collected + o.commission_held + o.commission_cod_pending)}
              />
            </div>
          </Section>

          <Section title="Transaction status">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminStatCard title="All orders" value={String(o.orders)} />
              <AdminStatCard title="Open" value={String(o.open_orders)} />
              <AdminStatCard title="Delivered (awaiting confirm)" value={String(o.delivered_orders ?? 0)} />
              <AdminStatCard title="Completed" value={String(o.completed_orders ?? 0)} />
              <AdminStatCard title="Cancelled / rejected" value={String(o.cancelled_orders)} />
              <AdminStatCard title="Returned" value={String(o.returned_orders)} />
              <AdminStatCard title="Paid payments" value={String(o.paid_payments)} />
              <AdminStatCard title="Open payments" value={String(o.open_payments)} />
              <AdminStatCard title="Refunded payments" value={String(o.refunded_payments ?? 0)} />
            </div>
          </Section>

          <Section title="Catalog">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminStatCard title="Active sellers" value={String(o.active_sellers)} />
              <AdminStatCard title="Revoked sellers" value={String(o.revoked_sellers)} />
              <AdminStatCard title="Listings" value={String(o.products)} />
              <AdminStatCard title="Waiting for review" value={String(o.pending_listings)} />
            </div>
          </Section>

          <TopSellers sellers={o.top_sellers ?? []} />

          <SettingsCard initial={o.settings} canWrite={can("sports_market:write")} onSaved={refresh} />
        </>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 font-heading text-sm font-semibold uppercase tracking-wide text-text-secondary">{title}</h2>
      {children}
    </section>
  );
}

function TopSellers({ sellers }: { sellers: SmTopSeller[] }) {
  if (!sellers.length) return null;
  return (
    <Section title="Seller earnings">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-4 py-3">Seller</th>
              <th className="px-4 py-3 text-right">Completed</th>
              <th className="px-4 py-3 text-right">Gross sales</th>
              <th className="px-4 py-3 text-right">Commission</th>
              <th className="px-4 py-3 text-right">They earned</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((s) => (
              <tr key={s.user_id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/people/${s.user_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {s.name}
                  </Link>
                  {s.username ? <p className="text-xs text-text-hint">@{s.username}</p> : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{s.completed_count}</td>
                <td className="px-4 py-3 text-right tabular-nums">{etb(s.gross_sales)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{etb(s.commission_total)}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-text-primary">{etb(s.net_earnings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-border px-4 py-2 text-right text-xs text-text-secondary">
          <Link href="/admin/sports-market/sellers" className="text-primary hover:underline">
            All sellers →
          </Link>
        </div>
      </div>
    </Section>
  );
}

function SettingsCard({ initial, canWrite, onSaved }: { initial: SmSettings; canWrite: boolean; onSaved: () => void }) {
  const [form, setForm] = useState<SmSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm(initial), [initial]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await patchAdmin(`${SM_API}/settings`, {
        commission_percent: Number(form.commission_percent),
        cod_enabled: form.cod_enabled,
        require_listing_approval: form.require_listing_approval,
        seller_terms: form.seller_terms ?? "",
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="mb-1 font-heading text-base font-semibold text-text-primary">Settings</h2>
      <p className="mb-4 text-sm text-text-secondary">
        Commission is charged on the product subtotal only, never on delivery fees. Changes apply to new orders.
      </p>
      {error ? <AdminErrorAlert message={error} /> : null}
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Platform commission (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            disabled={!canWrite}
            className={`${fieldClass} max-w-[10rem]`}
            value={form.commission_percent}
            onChange={(e) => setForm({ ...form, commission_percent: Number(e.target.value) })}
          />
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            disabled={!canWrite}
            checked={form.cod_enabled}
            onChange={(e) => setForm({ ...form, cod_enabled: e.target.checked })}
          />
          <span>
            <span className="font-medium text-text-primary">Allow cash on delivery</span>
            <span className="block text-text-secondary">
              The seller confirms the cash at delivery; the commission is then collected from their wallet or settled here.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            disabled={!canWrite}
            checked={form.require_listing_approval}
            onChange={(e) => setForm({ ...form, require_listing_approval: e.target.checked })}
          />
          <span>
            <span className="font-medium text-text-primary">Review listings before they go live</span>
            <span className="block text-text-secondary">New and edited listings wait in Listings → Waiting for review.</span>
          </span>
        </label>
        <div>
          <label className={labelClass}>Seller terms of service</label>
          <p className="mb-2 text-xs text-text-secondary">
            Shown on My store → Terms of service. Use blank lines between sections; the first line of each block can be a short heading.
          </p>
          <textarea
            rows={12}
            disabled={!canWrite}
            className={`${fieldClass} min-h-[12rem] font-mono text-sm`}
            value={form.seller_terms ?? ""}
            onChange={(e) => setForm({ ...form, seller_terms: e.target.value })}
            placeholder="Rules sellers must follow…"
          />
        </div>
        {canWrite ? (
          <div className="flex items-center gap-3">
            <button type="button" className={primaryButtonClass} disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save settings"}
            </button>
            {saved ? <span className="text-sm text-text-secondary">Saved</span> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
