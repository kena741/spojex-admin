"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminReloadButton,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  AdminStatCard,
  AdminTableLoading,
  AdminTableShell,
  type AdminRowMenuItem,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { deleteAdmin, patchAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { networkUserLabel, networkUserSecondary } from "@/lib/network-identity";
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
  note?: string;
  error?: string;
};

function parseTab(raw: string | null): TabId {
  return raw === "follows" || raw === "blocks" ? raw : "connections";
}

function parseStatus(raw: string | null): StatusFilter {
  return raw === "pending" || raw === "accepted" || raw === "declined" ? raw : "all";
}

function UserCell({
  userId,
  user,
}: {
  userId: string;
  user?: NetworkUserBrief | null;
}) {
  const label = networkUserLabel(user, userId);
  const secondary = networkUserSecondary(user);
  return (
    <Link href={`/admin/users/${userId}`} className="flex min-w-0 items-center gap-2 text-primary">
      <UserAvatar name={label} src={user?.avatar_url} size={28} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{label}</span>
        {secondary ? (
          <span className="block truncate text-[11px] text-text-secondary">{secondary}</span>
        ) : null}
      </span>
    </Link>
  );
}

function NetworkPageInner() {
  const { can } = useAdminPermissions();
  const canWrite = can("network:write");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Filters live in React state. Tab/status/search do not refetch - only Reload does.
  const [tab, setTab] = useState<TabId>(() => parseTab(searchParams.get("tab")));
  const [status, setStatus] = useState<StatusFilter>(() =>
    parseStatus(searchParams.get("status")),
  );
  const [query, setQuery] = useState(() => searchParams.get("q") || "");

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
  const [note, setNote] = useState<string | null>(null);

  const syncUrl = useCallback(
    (nextTab: TabId, nextStatus: StatusFilter, nextQuery: string) => {
      const next = new URLSearchParams();
      if (nextTab !== "connections") next.set("tab", nextTab);
      if (nextTab === "connections" && nextStatus !== "all") next.set("status", nextStatus);
      if (nextQuery.trim()) next.set("q", nextQuery.trim());
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/network", { credentials: "same-origin" });
      const payload = (await response.json()) as NetworkPayload;
      if (!response.ok) throw new Error(payload.error || "Failed to load connections");
      setItems(payload.items ?? []);
      setFollows(payload.follows ?? []);
      setBlocks(payload.blocks ?? []);
      setNote(payload.note ?? null);
      setCounts({
        pending: payload.counts?.pending ?? 0,
        accepted: payload.counts?.accepted ?? 0,
        declined: payload.counts?.declined ?? 0,
        total: payload.counts?.total ?? 0,
        follows: payload.counts?.follows ?? payload.follows?.length ?? 0,
        blocks: payload.counts?.blocks ?? payload.blocks?.length ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const selectTab = (next: TabId) => {
    setTab(next);
    const nextStatus: StatusFilter = next === "connections" ? status : "all";
    if (next !== "connections") setStatus("all");
    setQuery("");
    syncUrl(next, nextStatus, "");
  };

  const selectStatus = (next: StatusFilter) => {
    setStatus(next);
    syncUrl(tab, next, query);
  };

  const selectQuery = (value: string) => {
    setQuery(value);
    syncUrl(tab, status, value);
  };

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "connections", label: "Connections", count: counts.total },
    { id: "follows", label: "Follows", count: counts.follows },
    { id: "blocks", label: "Blocks", count: counts.blocks },
  ];

  const connectionsColSpan = canWrite ? 6 : 5;
  const followsColSpan = canWrite ? 5 : 4;
  const blocksColSpan = canWrite ? 6 : 5;

  return (
    <>
      <AdminPageHeader
        title="Connections"
        description="Peer connections, directional follows, and personal blocks between users."
        breadcrumbs={[
          { label: "Network", href: "/admin/network" },
          { label: "Connections" },
        ]}
        actions={<AdminReloadButton loading={loading} onClick={() => void load()} />}
      />

      {error ? <AdminErrorAlert message={error} /> : null}
      {note ? <p className="mb-3 text-xs text-text-secondary">{note}</p> : null}

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
              onClick={() => selectTab(item.id)}
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
                onChange={selectQuery}
                placeholder="Search by name, username, or user id"
              />
              <AdminSelect value={status} onChange={(value) => selectStatus(value as StatusFilter)}>
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="declined">Declined / cancelled</option>
              </AdminSelect>
            </div>
          </AdminFilterPanel>

          <AdminTableShell>
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
                  {loading ? (
                    <AdminTableLoading
                      colSpan={connectionsColSpan}
                      label="Loading connections…"
                    />
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={connectionsColSpan} className="p-0">
                        <AdminEmpty
                          title={
                            status === "pending"
                              ? "No pending peer requests"
                              : "No connections match"
                          }
                          description={
                            status === "pending"
                              ? "When users send connection requests to each other, pending rows appear here. These are not admin approval queues."
                              : "Try another status filter or clear search. Reload to fetch the latest data."
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((row) => {
                      const busy = busyId === row.id;
                      return (
                        <tr
                          key={`${row.source}-${row.id}`}
                          className="border-b border-border last:border-0 hover:bg-muted/40"
                        >
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
                            {row.responded_at
                              ? formatDateTime(row.responded_at)
                              : "Not recorded"}
                          </td>
                          {canWrite ? (
                            <td className="px-4 py-3">
                              <AdminRowMenu
                                disabled={busy}
                                aria-label="Connection actions"
                                items={(() => {
                                  const menuItems: AdminRowMenuItem[] = [];
                                  if (row.status === "pending" && row.request_id) {
                                    menuItems.push(
                                      {
                                        id: "accept",
                                        label: "Support: accept request",
                                        onClick: () => acceptRequest(row),
                                      },
                                      {
                                        id: "decline",
                                        label: "Support: decline request",
                                        onClick: () => declineRequest(row),
                                      },
                                      {
                                        id: "cancel",
                                        label: "Support: cancel request",
                                        onClick: () => cancelRequest(row),
                                      },
                                    );
                                  }
                                  if (row.status === "accepted" && row.connection_id) {
                                    menuItems.push({
                                      id: "remove",
                                      label: "Remove connection",
                                      tone: "danger",
                                      onClick: () => removeConnection(row),
                                    });
                                  }
                                  return menuItems;
                                })()}
                              />
                            </td>
                          ) : null}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </AdminTableShell>
        </>
      ) : null}

      {tab === "follows" ? (
        <>
          <p className="mb-3 text-xs text-text-secondary">
            Follows are directional (follower → following). Accepted connections are mutual.
          </p>
          <AdminFilterPanel>
            <AdminSearchInput
              value={query}
              onChange={selectQuery}
              placeholder="Search follower or following"
            />
          </AdminFilterPanel>
          <AdminTableShell>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Follower</th>
                    <th className="px-4 py-3 font-semibold">→</th>
                    <th className="px-4 py-3 font-semibold">Following</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <AdminTableLoading colSpan={followsColSpan} label="Loading follows…" />
                  ) : filteredFollows.length === 0 ? (
                    <tr>
                      <td colSpan={followsColSpan} className="p-0">
                        <AdminEmpty
                          title="No follows"
                          description="Public follow relationships from the app. Reload to fetch the latest data."
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredFollows.map((row) => {
                      const key = `${row.follower_id}-${row.following_id}`;
                      return (
                        <tr
                          key={key}
                          className="border-b border-border last:border-0 hover:bg-muted/40"
                        >
                          <td className="px-4 py-3">
                            <UserCell userId={row.follower_id} user={row.follower} />
                          </td>
                          <td className="px-4 py-3 text-text-hint">→</td>
                          <td className="px-4 py-3">
                            <UserCell userId={row.following_id} user={row.following} />
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {formatDateTime(row.created_at)}
                          </td>
                          {canWrite ? (
                            <td className="px-4 py-3">
                              <AdminRowMenu
                                disabled={busyId === key}
                                aria-label="Follow actions"
                                items={[
                                  {
                                    id: "remove-follow",
                                    label: "Remove follow",
                                    tone: "danger",
                                    onClick: () => removeFollow(row),
                                  },
                                ]}
                              />
                            </td>
                          ) : null}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </AdminTableShell>
        </>
      ) : null}

      {tab === "blocks" ? (
        <>
          <p className="mb-3 text-xs text-text-secondary">
            Personal user blocks (blocker → blocked). These are not platform moderation
            restrictions. Support unblock requires network write permission and is audited via
            the remove action.
          </p>
          <AdminFilterPanel>
            <AdminSearchInput
              value={query}
              onChange={selectQuery}
              placeholder="Search blocker or blocked user"
            />
          </AdminFilterPanel>
          <AdminTableShell>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Blocker</th>
                    <th className="px-4 py-3 font-semibold">→</th>
                    <th className="px-4 py-3 font-semibold">Blocked</th>
                    <th className="px-4 py-3 font-semibold">Scope</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <AdminTableLoading colSpan={blocksColSpan} label="Loading blocks…" />
                  ) : filteredBlocks.length === 0 ? (
                    <tr>
                      <td colSpan={blocksColSpan} className="p-0">
                        <AdminEmpty
                          title="No blocks"
                          description="User blocks from the connection graph. Reload to fetch the latest data."
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredBlocks.map((row) => {
                      const key = `${row.blocker_id}-${row.blocked_id}`;
                      return (
                        <tr
                          key={key}
                          className="border-b border-border last:border-0 hover:bg-muted/40"
                        >
                          <td className="px-4 py-3">
                            <UserCell userId={row.blocker_id} user={row.blocker} />
                          </td>
                          <td className="px-4 py-3 text-text-hint">→</td>
                          <td className="px-4 py-3">
                            <UserCell userId={row.blocked_id} user={row.blocked} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone="neutral">Personal block</StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {formatDateTime(row.created_at)}
                          </td>
                          {canWrite ? (
                            <td className="px-4 py-3">
                              <AdminRowMenu
                                disabled={busyId === key}
                                aria-label="Block actions"
                                items={[
                                  {
                                    id: "remove-block",
                                    label: "Support: remove block",
                                    tone: "danger",
                                    onClick: () => {
                                      const ok = window.confirm(
                                        "Remove this personal user block? This overrides the user's block preference and should only be used for verified support cases.",
                                      );
                                      if (ok) void removeBlock(row);
                                    },
                                  },
                                ]}
                              />
                            </td>
                          ) : null}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </AdminTableShell>
        </>
      ) : null}
    </>
  );
}

export default function NetworkPage() {
  return (
    <Suspense fallback={<AdminLoadingRow label="Loading connections…" />}>
      <NetworkPageInner />
    </Suspense>
  );
}
