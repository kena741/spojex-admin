"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminSearchInput,
  AdminSelect,
  AdminTableActions,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  campaignDisplayGoal,
  campaignDisplayRaised,
  campaignIsCoin,
  donationStatusLabel,
  donationStatuses,
  formatDonationAmount,
  slugifyDonation,
} from "@/lib/donations";
import BeneficiarySelect from "@/components/beneficiary-select";
import { deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { DonationCampaignRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type DonationDraft = {
  title: string;
  goal_amount: number;
  status: string;
};

export default function DonationsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("donations:write");
  const [rows, setRows] = useState<DonationCampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [createStatus, setCreateStatus] = useState("active");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DonationDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error: loadError } = await getSpojexClient()
      .from("donation_campaigns")
      .select("*")
      .order("sort_order")
      .order("created_at", { ascending: false })
      .limit(500);
    if (loadError) throw loadError;
    setRows((data ?? []) as DonationCampaignRow[]);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return [row.title, row.slug, row.summary].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [query, rows, status]);

  const create = async () => {
    if (!canWrite || !title.trim()) return;
    const goalCoins = Number(goal) || 0;
    if (goalCoins <= 0) {
      setError("Goal (coins) must be greater than 0");
      return;
    }
    const beneficiary = beneficiaryId.trim();
    setCreating(true);
    setError(null);
    try {
      await postAdmin("/api/admin/donations", {
        title: title.trim(),
        slug: slugifyDonation(title),
        summary: "",
        description: "",
        goal_amount: goalCoins,
        goal_coins: goalCoins,
        currency: "COIN",
        status: createStatus || "active",
        // Empty → API defaults to Spojex platform org owner.
        ...(beneficiary ? { beneficiary_user_id: beneficiary } : {}),
      });
      setTitle("");
      setGoal("");
      setBeneficiaryId("");
      setCreateStatus("active");
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (row: DonationCampaignRow) => {
    setEditingId(row.id);
    setDraft({ title: row.title, goal_amount: row.goal_amount, status: row.status });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    setSaving(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/donations/${editingId}`, {
        title: draft.title.trim(),
        goal_amount: draft.goal_amount,
        goal_coins: draft.goal_amount,
        currency: "COIN",
        status: draft.status,
      });
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: DonationCampaignRow) => {
    if (!window.confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/donations/${row.id}`);
      if (editingId === row.id) cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Donations"
        description="Fundraising campaigns"
        actions={
          canWrite ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Add donation
            </button>
          ) : null
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search title or summary" />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            {donationStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading campaigns…" /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty title="No campaigns" description="Create a donation campaign for the home page." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Campaign</th>
                  <th className="px-4 py-3 font-semibold">Raised</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Featured</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isEditing = editingId === row.id && draft;
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              value={draft.title}
                              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                              className="h-9 w-full min-w-[160px] rounded-lg border border-border px-2 text-sm"
                            />
                            <input
                              type="number"
                              min={0}
                              value={draft.goal_amount}
                              onChange={(e) =>
                                setDraft({ ...draft, goal_amount: Number(e.target.value) || 0 })
                              }
                              placeholder="Goal amount"
                              className="h-9 w-28 rounded-lg border border-border px-2 text-sm"
                            />
                          </div>
                        ) : (
                          <>
                            <Link href={`/admin/donations/${row.id}`} className="font-medium text-text-primary hover:text-primary">
                              {row.title}
                            </Link>
                            {row.summary ? (
                              <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{row.summary}</p>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {(() => {
                          const currency = campaignIsCoin(row) ? "COIN" : row.currency;
                          const raised = campaignDisplayRaised(row);
                          const goal = campaignDisplayGoal(row);
                          return `${formatDonationAmount(raised, currency)}${
                            goal > 0 ? ` / ${formatDonationAmount(goal, currency)}` : ""
                          }`;
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={draft.status}
                            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                            className="h-9 rounded-lg border border-border px-2 text-sm"
                          >
                            {donationStatuses.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <StatusBadge tone={requestTone(row.status)}>{donationStatusLabel(row.status)}</StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.is_featured ? (
                          <StatusBadge tone="success">Featured</StatusBadge>
                        ) : (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                      {canWrite ? (
                        <td className="px-4 py-3">
                          <AdminTableActions
                            canWrite
                            editing={Boolean(isEditing)}
                            saving={saving}
                            onEdit={() => startEdit(row)}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
                            onDelete={() => remove(row)}
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>

      <AdminModal
        open={createOpen}
        title="Add donation"
        onClose={() => {
          if (creating) return;
          setCreateOpen(false);
        }}
        sheet
        footer={
          <AdminModalFooter
            onCancel={() => setCreateOpen(false)}
            onSave={() => void create()}
            saving={creating}
            saveLabel="Create campaign"
          />
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
          className="grid gap-3"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Campaign title"
            required
            className="h-10 rounded-lg border border-border px-3 text-sm"
          />
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Goal (coins)"
            type="number"
            min={1}
            required
            className="h-10 rounded-lg border border-border px-3 text-sm"
          />
          <BeneficiarySelect
            value={beneficiaryId}
            onChange={setBeneficiaryId}
            disabled={!canWrite || creating}
          />
          <AdminSelect value={createStatus} onChange={setCreateStatus}>
            {donationStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
        </form>
      </AdminModal>
    </>
  );
}
