"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import BeneficiarySelect from "@/components/beneficiary-select";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  campaignAssetLabel,
  campaignDisplayGoal,
  campaignDisplayRaised,
  campaignIsCoin,
  campaignMedia,
  campaignProgressBarPercent,
  campaignProgressLabel,
  donationStatusLabel,
  donationStatuses,
  formatDonationAmount,
  slugifyDonation,
} from "@/lib/donations";
import { adminFetch, deleteAdmin, postAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { DonationCampaignRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type DirectoryRow = DonationCampaignRow & {
  href?: string;
};

type Totals = {
  etb_raised?: string | number;
  coin_raised?: string | number;
  active_count?: number;
  note?: string;
};

export default function DonationsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("donations:write");
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<Totals>({});
  const [page, setPage] = useState(Number(searchParams.get("page") || "1") || 1);
  const [pageSize] = useState(40);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [asset, setAsset] = useState(searchParams.get("asset") || "all");
  const [featured, setFeatured] = useState(searchParams.get("featured") || "all");
  const [beneficiary, setBeneficiary] = useState(searchParams.get("beneficiary") || "");
  const [view, setView] = useState<"cards" | "list">(
    searchParams.get("view") === "list" ? "list" : "cards",
  );
  const [sort, setSort] = useState(searchParams.get("sort") || "updated_at");
  const [order, setOrder] = useState(searchParams.get("order") || "desc");

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [createAsset, setCreateAsset] = useState<"coin" | "etb">("coin");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [createStatus, setCreateStatus] = useState("draft");

  const load = async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status !== "all") params.set("status", status);
    if (asset !== "all") params.set("asset", asset);
    if (featured !== "all") params.set("featured", featured);
    if (beneficiary.trim()) params.set("beneficiary", beneficiary.trim());
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    params.set("sort", sort);
    params.set("order", order);
    try {
      const res = await adminFetch(`/api/admin/donations?${params}`);
      const payload = (await res.json()) as {
        data?: DirectoryRow[];
        total?: number;
        totals?: Totals;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Failed to load");
      setRows(payload.data ?? []);
      setTotal(payload.total ?? 0);
      setTotals(payload.totals ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, asset, featured, beneficiary, sort, order]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (page !== 1) setPage(1);
      else void load();
    }, 300);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (status !== "all") next.set("status", status);
    if (asset !== "all") next.set("asset", asset);
    if (featured !== "all") next.set("featured", featured);
    if (beneficiary.trim()) next.set("beneficiary", beneficiary.trim());
    if (view !== "cards") next.set("view", view);
    if (sort !== "updated_at") next.set("sort", sort);
    if (order !== "desc") next.set("order", order);
    if (page > 1) next.set("page", String(page));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [query, status, asset, featured, beneficiary, view, sort, order, page, pathname, router]);

  const create = async () => {
    if (!canWrite || !title.trim()) return;
    const goalNum = Number(goal) || 0;
    if (goalNum <= 0) {
      setError("Goal must be greater than 0");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const isCoin = createAsset === "coin";
      await postAdmin("/api/admin/donations", {
        title: title.trim(),
        slug: slugifyDonation(title),
        summary: "",
        description: "",
        goal_amount: goalNum,
        goal_coins: isCoin ? goalNum : 0,
        currency: isCoin ? "COIN" : "ETB",
        status: createStatus || "draft",
        ...(beneficiaryId.trim() ? { beneficiary_user_id: beneficiaryId.trim() } : {}),
      });
      setTitle("");
      setGoal("");
      setBeneficiaryId("");
      setCreateStatus("draft");
      setCreateAsset("coin");
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (row: DirectoryRow) => {
    if (
      !window.confirm(
        `Close or delete "${row.title}"? Campaigns with contributions are closed to preserve history.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteAdmin(`/api/admin/donations/${row.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const renderProgress = (row: DirectoryRow) => {
    const currency = campaignIsCoin(row) ? "COIN" : row.currency || "ETB";
    const raised = campaignDisplayRaised(row);
    const goalVal = campaignDisplayGoal(row);
    const bar = campaignProgressBarPercent(row);
    return (
      <div className="min-w-[140px] space-y-1">
        <p className="text-sm tabular-nums text-text-primary">
          {formatDonationAmount(raised, currency)}
          {goalVal > 0 ? (
            <span className="text-text-secondary"> / {formatDonationAmount(goalVal, currency)}</span>
          ) : null}
        </p>
        {goalVal > 0 ? (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${bar}%` }} />
            </div>
            <p className="text-[11px] text-text-hint">{campaignProgressLabel(row)}</p>
          </>
        ) : null}
      </div>
    );
  };

  const beneficiaryLabel = (row: DirectoryRow) => {
    const b = row.beneficiary;
    if (b?.organization_name) return b.organization_name;
    if (b?.display_name) return b.display_name;
    if (row.beneficiary_user_id) return `${row.beneficiary_user_id.slice(0, 8)}…`;
    return "Spojex (default)";
  };

  return (
    <>
      <AdminPageHeader
        title="Donations"
        description="Fundraising campaigns - ETB and coins are tracked separately."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setView("cards")}
                className={`rounded-md px-3 py-1.5 ${view === "cards" ? "bg-muted font-medium" : "text-text-secondary"}`}
              >
                Cards
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={`rounded-md px-3 py-1.5 ${view === "list" ? "bg-muted font-medium" : "text-text-secondary"}`}
              >
                List
              </button>
            </div>
            {canWrite ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Add campaign
              </button>
            ) : null}
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase text-text-secondary">ETB raised</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatDonationAmount(Number(totals.etb_raised ?? 0), "ETB")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase text-text-secondary">Coins raised</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatDonationAmount(Number(totals.coin_raised ?? 0), "COIN")}
          </p>
          <p className="mt-1 text-[11px] text-text-hint">No implied cash value</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase text-text-secondary">Active campaigns</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{totals.active_count ?? "-"}</p>
        </div>
      </div>

      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <AdminSearchInput value={query} onChange={setQuery} placeholder="Search title or summary" />
          </div>
          <AdminSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }}>
            <option value="all">All statuses</option>
            {donationStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={asset} onChange={(v) => { setAsset(v); setPage(1); }}>
            <option value="all">All assets</option>
            <option value="coin">Coins</option>
            <option value="etb">ETB</option>
          </AdminSelect>
          <AdminSelect value={featured} onChange={(v) => { setFeatured(v); setPage(1); }}>
            <option value="all">Featured: any</option>
            <option value="yes">Featured only</option>
            <option value="no">Not featured</option>
          </AdminSelect>
          <AdminSelect
            value={`${sort}:${order}`}
            onChange={(v) => {
              const [s, o] = v.split(":");
              setSort(s || "updated_at");
              setOrder(o || "desc");
              setPage(1);
            }}
          >
            <option value="updated_at:desc">Updated ↓</option>
            <option value="updated_at:asc">Updated ↑</option>
            <option value="title:asc">Title A–Z</option>
            <option value="raised:desc">Raised ↓</option>
            <option value="status:asc">Status</option>
          </AdminSelect>
        </div>
        <div className="mt-3 max-w-md">
          <label className="mb-1 block text-xs text-text-secondary">Beneficiary user id (optional)</label>
          <input
            value={beneficiary}
            onChange={(e) => {
              setBeneficiary(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by beneficiary user id"
            className="h-10 w-full rounded-lg border border-border px-3 text-sm"
          />
        </div>
      </AdminFilterPanel>

      {loading ? <AdminLoadingRow label="Loading campaigns…" /> : null}

      {!loading && rows.length === 0 ? (
        <AdminEmpty title="No campaigns" description="Create a donation campaign for the home page." />
      ) : null}

      {!loading && rows.length > 0 && view === "cards" ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const media = campaignMedia(row);
            return (
              <article
                key={row.id}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
              >
                <div className="aspect-[16/9] bg-muted">
                  {media.display_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media.display_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-text-hint">No image</div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium leading-snug text-foreground">{row.title}</h3>
                    <StatusBadge tone={requestTone(row.status)}>
                      {donationStatusLabel(row.status)}
                    </StatusBadge>
                  </div>
                  {row.summary ? (
                    <p className="line-clamp-2 text-xs text-text-secondary">{row.summary}</p>
                  ) : null}
                  <p className="text-xs text-text-secondary">
                    {campaignAssetLabel(row)}
                    {row.is_featured ? " · Featured" : ""}
                  </p>
                  {renderProgress(row)}
                  <p className="text-xs text-text-secondary">Beneficiary: {beneficiaryLabel(row)}</p>
                  <p className="text-[11px] text-text-hint">
                    Updated {formatDate(row.updated_at || row.created_at)}
                  </p>
                  <Link
                    href={row.href || `/admin/donations/${row.id}`}
                    className="inline-flex text-sm font-medium text-primary hover:underline"
                  >
                    Open campaign
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {!loading && rows.length > 0 && view === "list" ? (
        <AdminTableShell>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Campaign</th>
                  <th className="px-4 py-3 font-semibold">Asset</th>
                  <th className="px-4 py-3 font-semibold">Raised / Target</th>
                  <th className="px-4 py-3 font-semibold">Beneficiary</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 font-semibold"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const media = campaignMedia(row);
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                            {media.display_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={media.display_url} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={row.href || `/admin/donations/${row.id}`}
                              className="font-medium text-text-primary hover:text-primary"
                            >
                              {row.title}
                            </Link>
                            {row.summary ? (
                              <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{row.summary}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{campaignAssetLabel(row)}</td>
                      <td className="px-4 py-3">{renderProgress(row)}</td>
                      <td className="px-4 py-3 text-text-secondary">{beneficiaryLabel(row)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge tone={requestTone(row.status)}>
                            {donationStatusLabel(row.status)}
                          </StatusBadge>
                          {row.is_featured ? <StatusBadge tone="success">Featured</StatusBadge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDate(row.updated_at || row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <AdminRowMenu
                          items={[
                            {
                              id: "open",
                              label: "Open",
                              href: row.href || `/admin/donations/${row.id}`,
                            },
                            ...(canWrite
                              ? [
                                  {
                                    id: "delete",
                                    label: "Close / delete",
                                    onClick: () => void remove(row),
                                    tone: "danger" as const,
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AdminTableShell>
      ) : null}

      {!loading && total > pageSize ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-text-secondary">
            Page {page} of {totalPages} · {total} campaigns
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <AdminModal
        open={createOpen}
        title="Add campaign"
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
          <AdminSelect
            value={createAsset}
            onChange={(v) => setCreateAsset(v === "etb" ? "etb" : "coin")}
          >
            <option value="coin">Coins (wallet gifts)</option>
            <option value="etb">ETB (Chapa payments)</option>
          </AdminSelect>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={createAsset === "coin" ? "Goal (coins)" : "Goal (ETB)"}
            type="number"
            min={1}
            required
            className="h-10 rounded-lg border border-border px-3 text-sm"
          />
          <div>
            <p className="mb-1 text-xs font-medium text-text-secondary">Public beneficiary</p>
            <BeneficiarySelect
              value={beneficiaryId}
              onChange={setBeneficiaryId}
              disabled={!canWrite || creating}
            />
          </div>
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
