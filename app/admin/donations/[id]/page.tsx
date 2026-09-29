"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow, AdminTableShell } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  campaignDisplayGoal,
  campaignDisplayRaised,
  campaignIsCoin,
  donationStatusLabel,
  donationStatuses,
  formatDonationAmount,
} from "@/lib/donations";
import { deleteAdmin, patchAdmin } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { DonationCampaignRow, DonationContributionRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function DonationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("donations:write");
  const [campaign, setCampaign] = useState<DonationCampaignRow | null>(null);
  const [contributions, setContributions] = useState<DonationContributionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const supabase = getSupabase();
    const [campaignRes, contribRes] = await Promise.all([
      supabase.from("donation_campaigns").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("donation_contributions")
        .select("*, users:user_id(id, display_name)")
        .eq("campaign_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (campaignRes.error) throw campaignRes.error;
    setCampaign(campaignRes.data as DonationCampaignRow | null);
    setContributions((contribRes.data ?? []) as DonationContributionRow[]);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async (patch: Record<string, unknown>) => {
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(`/api/admin/donations/${id}`, patch);
      await load();
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${campaign?.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/donations/${id}`);
      router.replace("/admin/donations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (loading) return <AdminLoadingRow label="Loading campaign…" />;
  if (!campaign) return <AdminErrorAlert message={error || "Campaign not found"} />;

  const isCoin = campaignIsCoin(campaign);
  const raised = campaignDisplayRaised(campaign);
  const goal = campaignDisplayGoal(campaign);
  const progress = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const displayCurrency = isCoin ? "COIN" : campaign.currency;

  return (
    <>
      <AdminPageHeader
        title={campaign.title}
        description={campaign.summary || campaign.slug || ""}
        backHref="/admin/donations"
        breadcrumbs={[
          { label: "Donations", href: "/admin/donations" },
          { label: campaign.title },
        ]}
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              {campaign.status !== "active" ? (
                <button
                  type="button"
                  onClick={() => save({ status: "active" })}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Publish
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => save({ is_featured: !campaign.is_featured })}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                {campaign.is_featured ? "Unfeature" : "Feature on home"}
              </button>
              <button
                type="button"
                onClick={remove}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          ) : null
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          {(campaign.cover_url || campaign.image_url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={campaign.cover_url || campaign.image_url}
              alt=""
              className="mb-4 h-40 w-full rounded-lg object-cover"
            />
          ) : null}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold">Overview</h2>
            <StatusBadge tone={requestTone(campaign.status)}>
              {donationStatusLabel(campaign.status)}
            </StatusBadge>
          </div>
          <p className="mb-4 text-sm text-text-secondary">{campaign.description || "No description."}</p>
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm font-medium">
            {formatDonationAmount(raised, displayCurrency)} raised
            {goal > 0
              ? ` of ${formatDonationAmount(goal, displayCurrency)} (${progress}%)`
              : ""}
          </p>
          {!campaign.beneficiary_user_id ? (
            <p className="mt-2 text-sm text-amber-700">
              Set a beneficiary user ID so coin gifts can credit a redeemable wallet.
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-heading text-sm font-semibold">Edit campaign</h2>
          {!canWrite ? (
            <p className="text-sm text-text-secondary">Read-only access.</p>
          ) : (
            <div className="grid gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Title</span>
                <input
                  defaultValue={campaign.title}
                  onBlur={(e) => {
                    if (e.target.value !== campaign.title) save({ title: e.target.value });
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Summary</span>
                <input
                  defaultValue={campaign.summary}
                  onBlur={(e) => {
                    if (e.target.value !== campaign.summary) save({ summary: e.target.value });
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Description</span>
                <textarea
                  defaultValue={campaign.description}
                  onBlur={(e) => {
                    if (e.target.value !== campaign.description) save({ description: e.target.value });
                  }}
                  rows={4}
                  className="w-full rounded-lg border border-border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Cover image URL</span>
                <input
                  defaultValue={campaign.cover_url}
                  onBlur={(e) => {
                    if (e.target.value !== campaign.cover_url) save({ cover_url: e.target.value });
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Thumbnail image URL</span>
                <input
                  defaultValue={campaign.image_url}
                  onBlur={(e) => {
                    if (e.target.value !== campaign.image_url) save({ image_url: e.target.value });
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Currency</span>
                <select
                  value={campaign.currency}
                  onChange={(e) => save({ currency: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border px-3"
                >
                  <option value="COIN">COIN</option>
                  <option value="ETB">ETB</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">
                  {isCoin ? "Goal (coins)" : "Goal amount"}
                </span>
                <input
                  type="number"
                  min={0}
                  defaultValue={isCoin ? campaign.goal_coins || campaign.goal_amount : campaign.goal_amount}
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    if (isCoin) {
                      if (value !== campaign.goal_coins || value !== campaign.goal_amount) {
                        save({ goal_coins: value, goal_amount: value, currency: "COIN" });
                      }
                    } else if (value !== campaign.goal_amount) {
                      save({ goal_amount: value });
                    }
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">
                  Beneficiary user ID (receives gift coins)
                </span>
                <input
                  defaultValue={campaign.beneficiary_user_id ?? ""}
                  placeholder="uuid of Spojex user"
                  onBlur={(e) => {
                    const value = e.target.value.trim() || null;
                    if (value !== campaign.beneficiary_user_id) {
                      save({ beneficiary_user_id: value });
                    }
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3 font-mono text-xs"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Status</span>
                <select
                  value={campaign.status}
                  onChange={(e) => save({ status: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border px-3"
                >
                  {donationStatuses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Sort order</span>
                <input
                  type="number"
                  defaultValue={campaign.sort_order}
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    if (value !== campaign.sort_order) save({ sort_order: value });
                  }}
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 font-heading text-sm font-semibold">Contributions</h2>
        <AdminTableShell>
          {contributions.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-secondary">No donations yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Donor</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Chapa ref</th>
                    <th className="px-4 py-3 font-semibold">Message</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {contributions.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        {row.is_anonymous ? (
                          "Anonymous"
                        ) : row.users ? (
                          <Link href={`/admin/users/${row.users.id}`} className="text-primary">
                            {row.users.display_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {formatDonationAmount(row.amount, row.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={requestTone(row.status)}>{row.status}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                        {row.provider_ref || "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.message || "—"}</td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminTableShell>
      </section>
    </>
  );
}
