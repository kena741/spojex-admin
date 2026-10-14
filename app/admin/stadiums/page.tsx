"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AdminCode, normalizeAdminCode } from "@/components/admin-code";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminSearchInput,
  AdminSelect,
  AdminTableActions,
  AdminTableShell,
} from "@/components/admin-layout";
import { StadiumEditModal } from "@/components/stadium-edit-modal";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { deleteAdmin } from "@/lib/hooks";
import { sizeTypeLabel, stadiumCoverUrl, stadiumStatuses, stadiumStatusLabel, stadiumSizeTypes, planTypeLabel } from "@/lib/stadiums";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { StadiumRow, StadiumSubscriptionRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function StadiumsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("stadiums:write");
  const [rows, setRows] = useState<StadiumRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<StadiumSubscriptionRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sizeType, setSizeType] = useState("all");
  const [editing, setEditing] = useState<StadiumRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const spojex = getSpojexClient();
    const [stadiumsRes, subsRes] = await Promise.all([
      spojex
        .from("stadiums")
        .select("*, users:owner_user_id(id, display_name, email)")
        .order("created_at", { ascending: false })
        .limit(500),
      spojex
        .from("stadium_subscriptions")
        .select("id, stadium_id, plan_type, status, pass_code, pass_number, created_at, users:user_id(id, display_name)")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);
    if (stadiumsRes.error) throw stadiumsRes.error;
    setRows((stadiumsRes.data ?? []) as StadiumRow[]);
    if (!subsRes.error) {
      setSubscriptions((subsRes.data ?? []) as StadiumSubscriptionRow[]);
    }
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const subscribersByStadium = useMemo(() => {
    const map: Record<string, StadiumSubscriptionRow[]> = {};
    for (const row of subscriptions) {
      (map[row.stadium_id] ??= []).push(row);
    }
    return map;
  }, [subscriptions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const codeQ = normalizeAdminCode(query);
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (sizeType !== "all" && row.size_type !== sizeType) return false;
      if (!q) return true;
      const textMatch = [row.name, row.slug, row.location, row.address, row.owner_name, row.contact_email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      if (textMatch) return true;
      return (subscribersByStadium[row.id] ?? []).some((sub) => {
        const code = normalizeAdminCode(sub.pass_code ?? "");
        const name = (sub.users?.display_name ?? "").toLowerCase();
        return (codeQ && code.includes(codeQ)) || name.includes(q);
      });
    });
  }, [query, rows, sizeType, status, subscribersByStadium]);

  const remove = async (row: StadiumRow) => {
    const label = row.name || "this stadium";
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/stadiums/${row.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Stadiums"
        description="Venues, subscribers, and pass codes"
        actions={
          canWrite ? (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setCreating(true);
              }}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Add stadium
            </button>
          ) : null
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name, location, owner, or pass code" />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            {stadiumStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={sizeType} onChange={setSizeType}>
            <option value="all">All sizes</option>
            {stadiumSizeTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading stadiums…" /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty title="No stadiums" description="Add a venue, or wait for an owner to submit one from the app." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Stadium</th>
                  <th className="px-4 py-3 font-semibold">Size</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const cover = stadiumCoverUrl(row);
                  const holders = subscribersByStadium[row.id] ?? [];
                  const open = expandedId === row.id;
                  const colSpan = canWrite ? 7 : 6;
                  return (
                    <Fragment key={row.id}>
                  <tr className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? null : row.id)}
                          className="rounded p-1 text-text-secondary hover:bg-muted hover:text-text-primary"
                          aria-label={open ? "Hide pass codes" : "Show pass codes"}
                        >
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cover}
                            alt=""
                            className="h-11 w-16 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-text-secondary">
                            No img
                          </div>
                        )}
                        <div>
                          <Link href={`/admin/stadiums/${row.id}`} className="font-medium text-text-primary hover:text-primary">
                            {row.name || "Unnamed"}
                          </Link>
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {row.contact_email || "—"}
                            {holders.length > 0 ? ` · ${holders.length} pass code${holders.length === 1 ? "" : "s"}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {sizeTypeLabel(row.size_type)}
                      {row.capacity > 0 ? ` · ${row.capacity}` : ""}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{row.location || row.address || "—"}</td>
                    <td className="px-4 py-3">
                      {row.users ? (
                        <Link href={`/admin/users/${row.users.id}`} className="text-primary hover:underline">
                          {row.users.display_name}
                        </Link>
                      ) : (
                        <span className="text-text-secondary">{row.owner_name || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone(row.status)}>{stadiumStatusLabel(row.status)}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <AdminTableActions
                          canWrite
                          onEdit={() => {
                            setCreating(false);
                            setEditing(row);
                          }}
                          onDelete={() => remove(row)}
                        />
                      </td>
                    ) : null}
                  </tr>
                  {open ? (
                    <tr className="border-b border-border last:border-0">
                      <td colSpan={colSpan} className="bg-muted/30 px-4 py-3">
                        {holders.length === 0 ? (
                          <p className="text-sm text-text-secondary">No subscriber pass codes yet.</p>
                        ) : (
                          <table className="min-w-full text-left text-sm">
                            <thead className="text-xs uppercase text-text-secondary">
                              <tr>
                                <th className="py-2 pr-4 font-semibold">#</th>
                                <th className="py-2 pr-4 font-semibold">Code</th>
                                <th className="py-2 pr-4 font-semibold">Subscriber</th>
                                <th className="py-2 pr-4 font-semibold">Plan</th>
                                <th className="py-2 font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {holders.map((sub) => (
                                <tr key={sub.id}>
                                  <td className="py-1.5 pr-4 tabular-nums">{sub.pass_number || "—"}</td>
                                  <td className="py-1.5 pr-4">
                                    <AdminCode value={sub.pass_code} />
                                  </td>
                                  <td className="py-1.5 pr-4">
                                    {sub.users ? (
                                      <Link href={`/admin/users/${sub.users.id}`} className="hover:text-primary">
                                        {sub.users.display_name}
                                      </Link>
                                    ) : (
                                      "User"
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-4 text-text-secondary">{planTypeLabel(sub.plan_type)}</td>
                                  <td className="py-1.5">
                                    <StatusBadge tone={requestTone(sub.status)}>{sub.status}</StatusBadge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>
      <StadiumEditModal
        stadium={editing}
        creating={creating}
        open={creating || Boolean(editing)}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSaved={load}
      />
    </>
  );
}

