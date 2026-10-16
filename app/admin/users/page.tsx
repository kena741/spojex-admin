"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, verifiedTone } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { allRoles, roleLabel } from "@/lib/catalog";
import { loadCoinWalletsByUserIds } from "@/lib/coin-wallets";
import { deleteAdmin, postAdminResponse, useIdentityCatalog } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { generateStadiumManagerPassword } from "@/lib/stadiums";
import type { CoinWalletRow, UserRow } from "@/lib/types";
import { formatCoins, formatDate, locationLabel } from "@/lib/utils";

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [coinByUser, setCoinByUser] = useState<Record<string, CoinWalletRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [verified, setVerified] = useState("all");
  const { catalog, roleOptions, roleLabel: catalogRoleLabel } = useIdentityCatalog();

  const load = async () => {
    const { data, error: loadError } = await getSpojexClient()
      .from("users")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (loadError) throw loadError;
    const users = (data ?? []) as UserRow[];
    setRows(users);
    const wallets = await loadCoinWalletsByUserIds(users.map((u) => u.id));
    setCoinByUser(wallets);
  };

  useEffect(() => {
    let mounted = true;
    load()
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (role !== "all" && (row.role || "") !== role) return false;
      if (verified === "yes" && !row.verified) return false;
      if (verified === "no" && row.verified) return false;
      if (!q) return true;
      return [
        row.display_name,
        row.full_name,
        row.username,
        row.email,
        row.phone,
        row.city,
        row.country,
        row.id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [query, role, rows, verified]);

  const resetPassword = async (row: UserRow) => {
    const label = row.display_name || row.email || "this user";
    if (!window.confirm(`Reset login password for “${label}”?`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      const next = generateStadiumManagerPassword();
      const payload = await postAdminResponse<{ password?: string; email?: string }>(
        `/api/admin/users/${row.id}/password`,
        { password: next },
      );
      const password = payload.password || next;
      const email = payload.email || row.email || "—";
      window.alert(`Password reset.\n\nEmail: ${email}\nPassword: ${password}\n\nShare this once — it will not be shown again.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: UserRow) => {
    const label = row.display_name || row.email || "this user";
    if (!window.confirm(`Delete “${label}”? They will no longer be able to sign in.`)) return;
    setBusyId(row.id);
    setError(null);
    setRows((current) => current.filter((item) => item.id !== row.id));
    try {
      await deleteAdmin(`/api/admin/users/${row.id}`);
    } catch (err) {
      setRows((current) => {
        if (current.some((item) => item.id === row.id)) return current;
        return [row, ...current];
      });
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AdminPageHeader title="Users" description={`${filtered.length} of ${rows.length} identities`} />
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_160px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name, email, city, football ID" />
          <AdminSelect value={role} onChange={setRole}>
            <option value="all">All roles</option>
            {(catalog ? roleOptions : allRoles).map((item) => (
              <option key={item.id || "none"} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={verified} onChange={setVerified}>
            <option value="all">All verification</option>
            <option value="yes">Verified</option>
            <option value="no">Unverified</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading users…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty title="No users match" description="Try a different search or role filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Gifts received</th>
                  <th className="px-4 py-3 font-semibold">Verified</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const coins = coinByUser[row.id]?.lifetime_received ?? 0;
                  const busy = busyId === row.id;
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/admin/users/${row.id}`} className="flex items-center gap-3">
                          <UserAvatar name={row.display_name} src={row.avatar_url} />
                          <span>
                            <span className="block font-medium text-text-primary">
                              {row.display_name || "Unnamed"}
                            </span>
                            <span className="block text-xs text-text-secondary">
                              {row.email || row.username || row.id.slice(0, 8)}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {catalog ? catalogRoleLabel(row.role) : roleLabel(row.role)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{locationLabel(row.city, row.country)}</td>
                      <td className="px-4 py-3 font-medium tabular-nums text-text-primary">
                        {formatCoins(coins)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={verifiedTone(row.verified)}>
                          {row.verified ? "Verified" : "Unverified"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void resetPassword(row)}
                            className="text-sm text-primary hover:underline disabled:opacity-50"
                          >
                            {busy ? "Working…" : "Reset password"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void remove(row)}
                            className="text-sm text-red-600 hover:underline disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>
    </>
  );
}
