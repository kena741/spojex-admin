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
import { useIdentityCatalog } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import type { CoinWalletRow, UserRow } from "@/lib/types";
import { formatCoins, formatDate, locationLabel } from "@/lib/utils";

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [coinByUser, setCoinByUser] = useState<Record<string, CoinWalletRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [verified, setVerified] = useState("all");
  const { catalog, roleOptions, roleLabel: catalogRoleLabel } = useIdentityCatalog();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error: loadError } = await getSpojexClient()
        .from("users")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!mounted) return;
      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }
      const users = (data ?? []) as UserRow[];
      setRows(users);
      const wallets = await loadCoinWalletsByUserIds(users.map((u) => u.id));
      if (!mounted) return;
      setCoinByUser(wallets);
      setLoading(false);
    };
    void load();
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
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const coins = coinByUser[row.id]?.lifetime_received ?? 0;
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
