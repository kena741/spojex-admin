"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Search, UserPlus } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminReloadButton,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import {
  ReasonModal,
  SmTabs,
  buttonClass,
  fieldClass,
  labelClass,
  primaryButtonClass,
  smGet,
  smPost,
} from "@/components/sports-market/shared";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { etb, shortDate, type SmSeller, type SmUser } from "@/lib/sports-market";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";

export default function SportsMarketSellersPage() {
  const { can } = useAdminPermissions();
  const canManage = can("sports_market:sellers");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams({ limit: "200" });
  if (status) params.set("status", status);
  if (debounced) params.set("q", debounced);
  const { data, loading, refreshing, error, refresh } = useAdminQuery<SmSeller[]>({
    key: adminCacheKey(["sports-market", "sellers", status, debounced]),
    fetcher: async () => (await smGet<{ sellers: SmSeller[] }>(`/sellers?${params}`)).sellers,
  });
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<SmSeller | null>(null);
  const sellers = data ?? [];

  return (
    <div>
      <AdminPageHeader
        title="Sports Marketplace"
        description="Choose which existing Spojex users can sell. Revoking blocks their seller tools and hides their listings at once."
        actions={
          <>
            <AdminReloadButton onClick={refresh} refreshing={refreshing} />
            {canManage ? (
              <button type="button" className={`${primaryButtonClass} h-10 px-4`} onClick={() => setGranting(true)}>
                <UserPlus className="h-4 w-4" /> Add seller
              </button>
            ) : null}
          </>
        }
      />
      <SmTabs />
      <AdminFilterPanel>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <AdminSearchInput value={q} onChange={setQ} placeholder="Search sellers by username, email or name" />
          </div>
          <AdminSelect value={status} onChange={setStatus}>
            <option value="">All sellers</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {loading && !data ? <AdminLoadingRow label="Loading sellers…" /> : null}
        {!loading && sellers.length === 0 && !error ? (
          <AdminEmpty title="No sellers yet" description="Add a seller by searching for their Spojex account." />
        ) : null}
        {sellers.length ? (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">Seller</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Listings</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Gross sales</th>
                <th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3 text-right">They earned</th>
                <th className="px-4 py-3 text-right">Completion</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.user_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <UserCell user={s.user} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={s.status === "active" ? "success" : "danger"}>
                      {s.status === "active" ? "Active" : "Revoked"}
                    </StatusBadge>
                    <p className="mt-1 text-xs text-text-hint">
                      {s.status === "active" ? `Since ${shortDate(s.granted_at)}` : `${shortDate(s.revoked_at)} · ${s.revoke_reason}`}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.live_product_count ?? 0}
                    <span className="text-text-hint"> / {s.product_count ?? 0}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.order_count ?? 0}
                    {s.open_count ? <span className="block text-xs text-text-hint">{s.open_count} open</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{etb(s.gross_sales)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{etb(s.commission_total)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-text-primary">{etb(s.net_earnings)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.completion_rate == null ? "—" : `${Math.round(s.completion_rate * 100)}%`}
                    {s.cancellation_rate ? (
                      <span className="block text-xs text-text-hint">{Math.round(s.cancellation_rate * 100)}% cancelled</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage ? (
                      s.status === "active" ? (
                        <button type="button" className={buttonClass} onClick={() => setRevoking(s)}>
                          Revoke
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={async () => {
                            await smPost(`/sellers`, { user_id: s.user_id, note: "Restored" });
                            refresh();
                          }}
                        >
                          Restore
                        </button>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </AdminTableShell>
      <GrantSellerModal open={granting} onClose={() => setGranting(false)} onGranted={refresh} />
      <ReasonModal
        open={!!revoking}
        title={`Revoke ${revoking?.user.name ?? "seller"}`}
        label="Reason (sent to the seller)"
        saveLabel="Revoke access"
        extra={
          <p className="text-sm text-text-secondary">
            Their seller dashboard stops working and their listings leave the marketplace right away. Open orders stay
            visible to you in Orders.
          </p>
        }
        onClose={() => setRevoking(null)}
        onSubmit={async (reason) => {
          await smPost(`/sellers/${revoking!.user_id}/revoke`, { reason });
          refresh();
        }}
      />
    </div>
  );
}

function UserCell({ user, linkToPeople = true }: { user: SmUser; linkToPeople?: boolean }) {
  const peopleHref = linkToPeople && user.id ? `/admin/people/${user.id}` : null;
  const name = (
    <span className="flex items-center gap-1 truncate font-medium text-text-primary">
      {user.name}
      {user.verified ? <BadgeCheck className="h-3.5 w-3.5 text-primary" /> : null}
    </span>
  );
  return (
    <div className="flex items-center gap-3">
      {user.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-text-secondary">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        {peopleHref ? (
          <Link href={peopleHref} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            {name}
          </Link>
        ) : (
          name
        )}
        <p className="truncate text-xs text-text-secondary">
          {user.username ? `@${user.username}` : ""}
          {user.email ? ` · ${user.email}` : ""}
        </p>
        {user.city || user.country ? (
          <p className="truncate text-xs text-text-hint">{[user.city, user.country].filter(Boolean).join(", ")}</p>
        ) : null}
      </div>
    </div>
  );
}

function GrantSellerModal({ open, onClose, onGranted }: { open: boolean; onClose: () => void; onGranted: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SmUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<SmUser | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults([]);
    setPicked(null);
    setNote("");
    setError(null);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const out = await smGet<{ users: SmUser[] }>(`/users/search?q=${encodeURIComponent(term)}`);
        if (!cancelled) setResults(out.users);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      await smPost(`/sellers`, { user_id: picked.id, note });
      onGranted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add seller");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal
      open={open}
      title="Add a seller"
      onClose={onClose}
      footer={
        <AdminModalFooter onCancel={onClose} onSave={save} saving={saving} disabled={!picked} saveLabel="Grant seller access" />
      }
    >
      <div className="space-y-4">
        {error ? <AdminErrorAlert message={error} /> : null}
        <div>
          <label className={labelClass}>Find a Spojex user</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-hint" />
            <input
              autoFocus
              className={`${fieldClass} pl-9`}
              placeholder="Username, email, name or phone"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        {searching ? <p className="text-sm text-text-secondary">Searching…</p> : null}
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setPicked(u)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left ${
                picked?.id === u.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
              }`}
            >
              <UserCell user={u} linkToPeople={false} />
              {u.seller_status === "active" ? (
                <StatusBadge tone="success">Seller</StatusBadge>
              ) : u.seller_status === "revoked" ? (
                <StatusBadge tone="danger">Revoked</StatusBadge>
              ) : null}
            </button>
          ))}
          {!searching && q.trim().length >= 2 && results.length === 0 ? (
            <p className="text-sm text-text-secondary">No users match.</p>
          ) : null}
        </div>
        {picked ? (
          <div>
            <label className={labelClass}>Internal note (optional)</label>
            <input className={fieldClass} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>
        ) : null}
      </div>
    </AdminModal>
  );
}
