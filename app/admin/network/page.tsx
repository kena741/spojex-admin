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
  AdminStatCard,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { deleteAdmin, patchAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { BlockRow, FollowRow, NetworkConnectionItem, NetworkUserBrief } from "@/lib/types";
import { cn, formatDateTime, formatStatusLabel } from "@/lib/utils";

type TabId = "connections" | "follows" | "blocks";
type StatusFilter = "all" | "pending" | "accepted" | "declined";

type NetworkPayload = {
  items?: NetworkConnectionItem[];
  follows?: FollowRow[];
  blocks?: BlockRow[];
  counts?: {
    pending: number;
    accepted: number;
    declined: number;
    total: number;
    follows: number;
    blocks: number;
  };
  error?: string;
};

function userLabel(user?: NetworkUserBrief | null, fallbackId?: string) {
  return user?.display_name || user?.username || (fallbackId ? fallbackId.slice(0, 8) : "User");
}

function UserCell({
  userId,
  user,
}: {
  userId: string;
  user?: NetworkUserBrief | null;
}) {
  return (
    <Link href={`/admin/users/${userId}`} className="flex min-w-0 items-center gap-2 text-primary">
      <UserAvatar name={userLabel(user, userId)} src={user?.avatar_url} size={28} />
      <span className="min-w-0 truncate font-medium">{userLabel(user, userId)}</span>
    </Link>
  );
}

export default function NetworkPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("network:write");

  const [tab, setTab] = useState<TabId>("connections");
  const [items, setItems] = useState<NetworkConnectionItem[]>([]);
  const [follows, setFollows] = useState<FollowRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [counts, setCounts] = useState({
    pending: 0,
    accepted: 0,
    declined: 0,
    total: 0,
    follows: 0,
    blocks: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("pending");

  const load = async () => {
    const response = await fetch("/api/admin/network", { credentials: "same-origin" });
    const payload = (await response.json()) as NetworkPayload;
    if (!response.ok) throw new Error(payload.error || "Failed to load connections");
    setItems(payload.items ?? []);
    setFollows(payload.follows ?? []);
    setBlocks(payload.blocks ?? []);
    setCounts({
      pending: payload.counts?.pending ?? 0,
      accepted: payload.counts?.accepted ?? 0,
      declined: payload.counts?.declined ?? 0,
      total: payload.counts?.total ?? 0,
      follows: payload.counts?.follows ?? payload.follows?.length ?? 0,
      blocks: payload.counts?.blocks ?? payload.blocks?.length ?? 0,
    });
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((row) => {
      if (status === "declined") {
        if (row.status !== "declined" && row.status !== "cancelled") return false;
      } else if (status !== "all" && row.status !== status) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        row.from_user?.display_name,
        row.from_user?.username,
        row.to_user?.display_name,
        row.to_user?.username,
        row.from_user_id,
        row.to_user_id,
        row.status,
      ];
      return haystack.some((value) => String(value ?? "").toLowerCase().includes(q));
    });
  }, [items, query, status]);

  const filteredFollows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return follows;
    return follows.filter((row) =>
      [
        row.follower?.display_name,
        row.follower?.username,
        row.following?.display_name,
        row.following?.username,
        row.follower_id,
        row.following_id,
      ].some((value) => String(value ?? "").toLowerCase().includes(q)),
    );
  }, [follows, query]);

  const filteredBlocks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return blocks;
    return blocks.filter((row) =>
      [
        row.blocker?.display_name,
        row.blocker?.username,
        row.blocked?.display_name,
        row.blocked?.username,
        row.blocker_id,
        row.blocked_id,
      ].some((value) => String(value ?? "").toLowerCase().includes(q)),
    );
  }, [blocks, query]);

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyId(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const acceptRequest = (row: NetworkConnectionItem) => {
    if (!row.request_id) return;
    void runAction(row.id, async () => {
      await patchAdmin(`/api/admin/network/requests/${row.request_id}`, { action: "accept" });
    });
  };

  const declineRequest = (row: NetworkConnectionItem) => {
    if (!row.request_id) return;
    void runAction(row.id, async () => {
      await patchAdmin(`/api/admin/network/requests/${row.request_id}`, { action: "decline" });
    });
  };

  const cancelRequest = (row: NetworkConnectionItem) => {
    if (!row.request_id) return;
    void runAction(row.id, async () => {
      await patchAdmin(`/api/admin/network/requests/${row.request_id}`, { action: "cancel" });
    });
  };

  const removeConnection = (row: NetworkConnectionItem) => {
    if (!row.connection_id) return;
    if (!window.confirm("Remove this connection? Users will need to reconnect.")) return;
    void runAction(row.id, async () => {
      await deleteAdmin(`/api/admin/network/connections/${row.connection_id}`);
    });
  };

  const removeFollow = (row: FollowRow) => {
    if (!window.confirm("Remove this follow?")) return;
    const key = `${row.follower_id}-${row.following_id}`;
    void runAction(key, async () => {
      await deleteAdmin("/api/admin/network/follows", {
        follower_id: row.follower_id,
        following_id: row.following_id,
      });
    });
  };

  const removeBlock = (row: BlockRow) => {
    if (!window.confirm("Remove this block?")) return;
    const key = `${row.blocker_id}-${row.blocked_id}`;
    void runAction(key, async () => {
      await deleteAdmin("/api/admin/network/blocks", {
        blocker_id: row.blocker_id,
        blocked_id: row.blocked_id,
      });
    });
  };

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "connections", label: "Connections", count: counts.total },
    { id: "follows", label: "Follows", count: counts.follows },
    { id: "blocks", label: "Blocks", count: counts.blocks },
  ];

  return (
    <>
      <AdminPageHeader
        title="Connections"
        description="Manage connection requests, active pairs, follows, and blocks."
      />

      {loading ? <AdminLoadingRow label="Loading connections…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard title="Pending" value={String(counts.pending)} />
        <AdminStatCard title="Connected" value={String(counts.accepted)} />
        <AdminStatCard title="Declined / cancelled" value={String(counts.declined)} />
        <AdminStatCard title="Follows" value={String(counts.follows)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setQuery("");
                if (item.id === "connections") setStatus("pending");
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm",
                active
                  ? "bg-primary font-medium text-primary-foreground"
                  : "border border-border bg-card",
              )}
            >
              {item.label} ({item.count})
            </button>
          );
        })}
      </div>

      {tab === "connections" ? (
        <>
          <AdminFilterPanel>
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <AdminSearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search by name, username, or user id"
              />
              <AdminSelect
                value={status}
                onChange={(value) => setStatus(value as StatusFilter)}
              >
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="declined">Declined / cancelled</option>
                <option value="all">All statuses</option>
              </AdminSelect>
            </div>
          </AdminFilterPanel>

          <AdminTableShell>
            {filteredItems.length === 0 && !loading ? (
              <AdminEmpty
                title={status === "pending" ? "No pending requests" : "No connections"}
                description={
                  status === "pending"
                    ? "Incoming connection requests will show here for review."
                    : "Try another status filter, or confirm the service role key can read network tables."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">From</th>
                      <th className="px-4 py-3 font-semibold">To</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Created</th>
                      <th className="px-4 py-3 font-semibold">Responded</th>
                      {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((row) => {
                      const busy = busyId === row.id;
                      return (
                        <tr key={`${row.source}-${row.id}`} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            <UserCell userId={row.from_user_id} user={row.from_user} />
                          </td>
                          <td className="px-4 py-3">
                            <UserCell userId={row.to_user_id} user={row.to_user} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={requestTone(row.status)}>
                              {formatStatusLabel(row.status)}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {formatDateTime(row.created_at)}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {row.responded_at ? formatDateTime(row.responded_at) : "—"}
                          </td>
                          {canWrite ? (
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                {row.status === "pending" && row.request_id ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => acceptRequest(row)}
                                      className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
                                    >
                                      Accept
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => declineRequest(row)}
                                      className="text-sm text-red-600 hover:underline disabled:opacity-50"
                                    >
                                      Decline
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => cancelRequest(row)}
                                      className="text-sm text-text-secondary hover:underline disabled:opacity-50"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : null}
                                {row.status === "accepted" && row.connection_id ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => removeConnection(row)}
                                    className="text-sm text-red-600 hover:underline disabled:opacity-50"
                                  >
                                    Remove
                                  </button>
                                ) : null}
                                {row.status !== "pending" &&
                                !(row.status === "accepted" && row.connection_id) ? (
                                  <span className="text-text-secondary">—</span>
                                ) : null}
                              </div>
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
        </>
      ) : null}

      {tab === "follows" ? (
        <>
          <AdminFilterPanel>
            <AdminSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search follower or following"
            />
          </AdminFilterPanel>
          <AdminTableShell>
            {filteredFollows.length === 0 && !loading ? (
              <AdminEmpty title="No follows" description="Public follow relationships from the app." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Follower</th>
                      <th className="px-4 py-3 font-semibold">Following</th>
                      <th className="px-4 py-3 font-semibold">Created</th>
                      {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFollows.map((row) => {
                      const key = `${row.follower_id}-${row.following_id}`;
                      return (
                        <tr key={key} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            <UserCell userId={row.follower_id} user={row.follower} />
                          </td>
                          <td className="px-4 py-3">
                            <UserCell userId={row.following_id} user={row.following} />
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {formatDateTime(row.created_at)}
                          </td>
                          {canWrite ? (
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                disabled={busyId === key}
                                onClick={() => removeFollow(row)}
                                className="text-sm text-red-600 hover:underline disabled:opacity-50"
                              >
                                Remove
                              </button>
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
        </>
      ) : null}

      {tab === "blocks" ? (
        <>
          <AdminFilterPanel>
            <AdminSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search blocker or blocked user"
            />
          </AdminFilterPanel>
          <AdminTableShell>
            {filteredBlocks.length === 0 && !loading ? (
              <AdminEmpty title="No blocks" description="User blocks from the connection graph." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Blocker</th>
                      <th className="px-4 py-3 font-semibold">Blocked</th>
                      <th className="px-4 py-3 font-semibold">Created</th>
                      {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBlocks.map((row) => {
                      const key = `${row.blocker_id}-${row.blocked_id}`;
                      return (
                        <tr key={key} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            <UserCell userId={row.blocker_id} user={row.blocker} />
                          </td>
                          <td className="px-4 py-3">
                            <UserCell userId={row.blocked_id} user={row.blocked} />
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {formatDateTime(row.created_at)}
                          </td>
                          {canWrite ? (
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                disabled={busyId === key}
                                onClick={() => removeBlock(row)}
                                className="text-sm text-red-600 hover:underline disabled:opacity-50"
                              >
                                Unblock
                              </button>
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
        </>
      ) : null}
    </>
  );
}
