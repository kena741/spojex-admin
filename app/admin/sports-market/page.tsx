"use client";

import { useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow, AdminReloadButton, AdminStatCard } from "@/components/admin-layout";
import { SmTabs, fieldClass, labelClass, primaryButtonClass, smGet } from "@/components/sports-market/shared";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { patchAdmin } from "@/lib/hooks";
import { SM_API, etb, type SmOverview, type SmSettings } from "@/lib/sports-market";
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
        title="Sports Marketplace"
        description="Sellers you approve list sports products; buyers order and pay in the app."
        actions={<AdminReloadButton onClick={refresh} refreshing={refreshing} />}
      />
      <SmTabs />
      {error ? <AdminErrorAlert message={error} /> : null}
      {loading && !o ? <AdminLoadingRow label="Loading marketplace…" /> : null}
      {o ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminStatCard title="Active sellers" value={String(o.active_sellers)} />
            <AdminStatCard title="Listings" value={String(o.products)} />
            <AdminStatCard title="Waiting for review" value={String(o.pending_listings)} />
            <AdminStatCard title="Open orders" value={String(o.open_orders)} />
            <AdminStatCard title="Sales (completed)" value={etb(o.gmv)} />
            <AdminStatCard title="Commission collected" value={etb(o.commission_collected)} />
            <AdminStatCard title="Commission held (paid, not completed)" value={etb(o.commission_held)} />
            <AdminStatCard title="Cash commission pending" value={etb(o.commission_cod_pending)} />
            <AdminStatCard title="All orders" value={String(o.orders)} />
            <AdminStatCard title="Cancelled / rejected" value={String(o.cancelled_orders)} />
            <AdminStatCard title="Returned" value={String(o.returned_orders)} />
            <AdminStatCard title="Open payments" value={String(o.open_payments)} />
          </div>
          <SettingsCard initial={o.settings} canWrite={can("sports_market:write")} onSaved={refresh} />
        </>
      ) : null}
    </div>
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
