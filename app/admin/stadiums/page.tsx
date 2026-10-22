"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminReloadButton,
  AdminSearchInput,
  AdminSelect,
  AdminTableActions,
  AdminTableLoading,
  AdminTableShell,
} from "@/components/admin-layout";
import { SearchableSelect } from "@/components/searchable-select";
import { StadiumEditModal } from "@/components/stadium-edit-modal";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  ADDIS_ABABA_SUBCITIES,
  formatStadiumArea,
  weredaOptionsForSubcity,
} from "@/lib/addis-ababa-locations";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { deleteAdmin, postAdminResponse } from "@/lib/hooks";
import {
  sizeTypeLabel,
  stadiumCoverUrl,
  stadiumStatuses,
  stadiumStatusLabel,
  stadiumSizeTypes,
  stadiumSurfaceLabel,
  planTypeLabel,
} from "@/lib/stadiums";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import type { StadiumRow, StadiumSubscriptionRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type StadiumsListData = { rows: StadiumRow[]; subscriptions: StadiumSubscriptionRow[] };

export default function StadiumsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("stadiums:write");
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [sizeType, setSizeType] = useState(searchParams.get("size_type") || "all");
  const [subcity, setSubcity] = useState(searchParams.get("subcity") || "");
  const [wereda, setWereda] = useState(searchParams.get("wereda") || "");
  const [editing, setEditing] = useState<StadiumRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [surface, setSurface] = useState(searchParams.get("surface") || "all");

  // Single cached fetch (list is filtered client-side). Reload to refetch.
  const {
    data: listData,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<StadiumsListData>({
    key: adminCacheKey(["stadiums", "list"]),
    fetcher: async () => {
      const spojex = getSpojexClient();
      const [stadiumsRes, subsRes] = await Promise.all([
        spojex
          .from("stadiums")
          .select("*, users:owner_user_id(id, display_name, email)")
          .order("created_at", { ascending: false })
          .limit(500),
        // Pass codes intentionally omitted from list responses - reveal only on detail with audit.
        spojex
          .from("stadium_subscriptions")
          .select("id, stadium_id, plan_type, status, created_at, users:user_id(id, display_name)")
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);
      if (stadiumsRes.error) throw new Error(stadiumsRes.error.message || "Failed to load");
      return {
        rows: (stadiumsRes.data ?? []) as StadiumRow[],
        subscriptions: subsRes.error ? [] : ((subsRes.data ?? []) as StadiumSubscriptionRow[]),
      };
    },
  });

  const rows = useMemo(() => listData?.rows ?? [], [listData]);
  const subscriptions = useMemo(() => listData?.subscriptions ?? [], [listData]);
  const error = actionError ?? loadError;

  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (status !== "all") next.set("status", status);
    if (sizeType !== "all") next.set("size_type", sizeType);
    if (surface !== "all") next.set("surface", surface);
    if (subcity) next.set("subcity", subcity);
    if (wereda) next.set("wereda", wereda);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [query, status, sizeType, surface, subcity, wereda, pathname, router]);

  const subscribersByStadium = useMemo(() => {
    const map: Record<string, StadiumSubscriptionRow[]> = {};
    for (const row of subscriptions) {
      (map[row.stadium_id] ??= []).push(row);
    }
    return map;
  }, [subscriptions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const weredaNum = wereda ? Number(wereda) : null;
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (sizeType !== "all" && row.size_type !== sizeType) return false;
      if (surface !== "all" && (row.surface || "").toLowerCase() !== surface.toLowerCase()) {
        return false;
      }
      if (subcity && (row.subcity || "").trim() !== subcity) return false;
      if (weredaNum != null && Number.isFinite(weredaNum) && row.wereda !== weredaNum) {
        return false;
      }
      if (!q) return true;
      const textMatch = [
        row.name,
        row.slug,
        row.location,
        row.address,
        row.subcity,
        row.wereda != null ? `woreda ${row.wereda}` : "",
        row.owner_name,
        row.contact_email,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      if (textMatch) return true;
      return (subscribersByStadium[row.id] ?? []).some((sub) => {
        const name = (sub.users?.display_name ?? "").toLowerCase();
        return name.includes(q);
      });
    });
  }, [query, rows, sizeType, surface, status, subcity, wereda, subscribersByStadium]);

  const subcityFilterOptions = ADDIS_ABABA_SUBCITIES.map((s) => ({
    value: s.name,
    label: s.name,
    searchText: `${s.id} ${s.aliases.join(" ")}`,
  }));
  const weredaFilterOptions = weredaOptionsForSubcity(subcity);

  const rememberReturn = () => {
    try {
      sessionStorage.setItem(
        "stadiums-return",
        `${pathname}?${searchParams.toString()}`,
      );
    } catch {
      /* ignore */
    }
  };

  const remove = async (row: StadiumRow) => {
    const label = row.name || "this stadium";
    if (
      !window.confirm(
        `Deactivate “${label}”? Venues with bookings or payments are set inactive (history preserved). Empty venues may be removed.`,
      )
    ) {
      return;
    }
    if (deletingId) return;
    setError(null);
    setDeletingId(row.id);
    try {
      const result = (await deleteAdmin(`/api/admin/stadiums/${row.id}`)) as {
        archived?: boolean;
        message?: string;
      };
      setNotice(
        result?.archived
          ? result.message || "Deactivated - bookings and payments preserved."
          : result?.message || "Removed.",
      );
      await refresh();
      if (expandedId === row.id) setExpandedId(null);
      if (editing?.id === row.id) setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setDeletingId(null);
    }
  };

  const importAddisFields = async () => {
    if (!canWrite || importing) return;
    setImporting(true);
    setError(null);
    try {
      const preview = await postAdminResponse<{
        creates?: number;
        updates?: number;
        location_reviews?: number;
        policy?: { note?: string };
      }>("/api/admin/stadiums/import-addis?preview=true", {});
      const proceed = window.confirm(
        `AddisSport import preview\n\nCreates: ${preview.creates ?? 0}\nUpdates: ${preview.updates ?? 0}\nLocation reviews: ${preview.location_reviews ?? 0}\n\n${preview.policy?.note || "Local pricing, ownership, and status are preserved."}\n\nRun import?`,
      );
      if (!proceed) return;
      const result = await postAdminResponse<{
        created?: number;
        updated?: number;
        skipped?: number;
        errors?: { name: string; error: string }[];
      }>("/api/admin/stadiums/import-addis", {});
      await refresh();
      const errCount = result.errors?.length ?? 0;
      setNotice(
        `Import done - created ${result.created ?? 0}, updated ${result.updated ?? 0}, errors ${errCount}.`,
      );
      if (errCount > 0) {
        setError(result.errors!.map((e) => `${e.name}: ${e.error}`).slice(0, 5).join(" · "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Stadiums"
        description="Venues, hourly reservations, and access passes - pass codes stay on the detail workspace"
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => void refresh()}
            />
            {canWrite ? (
              <>
              <button
                type="button"
                disabled={importing}
                onClick={() => void importAddisFields()}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-text-primary disabled:opacity-60"
              >
                {importing ? "Importing…" : "Import AddisSport fields"}
              </button>
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
              </>
            ) : null}
          </div>
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_140px_140px_140px]">
          <AdminSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search name, sub-city, woreda, owner"
          />
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
          <AdminSelect value={surface} onChange={setSurface}>
            <option value="all">All surfaces</option>
            <option value="Artificial">Artificial</option>
            <option value="Grass">Grass</option>
            <option value="Red Ash">Red Ash</option>
            <option value="Other">Other</option>
          </AdminSelect>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <SearchableSelect
            value={subcity}
            onChange={(next) => {
              setSubcity(next);
              setWereda("");
            }}
            options={subcityFilterOptions}
            placeholder="All sub-cities"
            searchPlaceholder="Search sub-city…"
          />
          <SearchableSelect
            value={wereda}
            onChange={setWereda}
            options={weredaFilterOptions}
            disabled={!subcity}
            placeholder={subcity ? "All woredas" : "Pick a sub-city first"}
            searchPlaceholder="Search woreda…"
            emptyLabel={subcity ? "No matching woreda" : "Select a sub-city first"}
          />
        </div>
      </AdminFilterPanel>
      <AdminTableShell>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Stadium</th>
                  <th className="px-4 py-3 font-semibold">Size / surface</th>
                  <th className="px-4 py-3 font-semibold">Capacity</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Owner / operator</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <AdminTableLoading colSpan={7} label="Loading stadiums…" />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-0">
                      <AdminEmpty title="No stadiums" description="Add a venue, or wait for an owner to submit one from the app." />
                    </td>
                  </tr>
                ) : filtered.map((row) => {
                  const cover = stadiumCoverUrl(row);
                  const holders = subscribersByStadium[row.id] ?? [];
                  const open = expandedId === row.id;
                  const colSpan = 7;
                  return (
                    <Fragment key={row.id}>
                  <tr className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? null : row.id)}
                          className="rounded p-1 text-text-secondary hover:bg-muted hover:text-text-primary"
                          aria-label={open ? "Hide subscribers" : "Show subscribers"}
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
                          <Link
                            href={`/admin/stadiums/${row.id}`}
                            onClick={rememberReturn}
                            className="font-medium text-text-primary hover:text-primary"
                          >
                            {row.name || "Unnamed"}
                          </Link>
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {holders.length > 0
                              ? `${holders.length} active pass${holders.length === 1 ? "" : "es"}`
                              : "No active passes"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {sizeTypeLabel(row.size_type)}
                      <span className="block text-xs">{stadiumSurfaceLabel(row.surface)}</span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary tabular-nums">
                      {row.capacity > 0 ? (
                        <>
                          <span className="font-medium text-text-primary">{row.capacity}</span>
                          <span className="block text-[10px] uppercase text-text-hint">players</span>
                        </>
                      ) : (
                        <span className="text-text-hint">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatStadiumArea(row.subcity, row.wereda) ||
                        row.location ||
                        row.address ||
                        "-"}
                    </td>
                    <td className="px-4 py-3">
                      {row.users ? (
                        <Link href={`/admin/people/${row.users.id}`} className="text-primary hover:underline">
                          {row.users.display_name}
                        </Link>
                      ) : (
                        <span className="text-text-secondary">{row.owner_name || "-"}</span>
                      )}
                      {row.users && row.owner_name && row.owner_name !== row.users.display_name ? (
                        <span className="mt-0.5 block text-[11px] text-text-hint">
                          Operator: {row.owner_name}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone(row.status)}>{stadiumStatusLabel(row.status)}</StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <AdminTableActions
                        canWrite={canWrite}
                        deleting={deletingId === row.id}
                        viewHref={`/admin/stadiums/${row.id}`}
                        onView={rememberReturn}
                        onEdit={
                          canWrite
                            ? () => {
                                setCreating(false);
                                setEditing(row);
                              }
                            : undefined
                        }
                        onDelete={canWrite ? () => void remove(row) : undefined}
                      />
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-b border-border last:border-0">
                      <td colSpan={colSpan} className="bg-muted/30 px-4 py-3">
                        {holders.length === 0 ? (
                          <p className="text-sm text-text-secondary">No active subscriptions yet.</p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-sm text-text-secondary">
                              {holders.length} active subscription{holders.length === 1 ? "" : "s"}. Pass
                              codes are concealed on list views - open the stadium to reveal them
                              (requires permission; access is audited).
                            </p>
                            <table className="min-w-full text-left text-sm">
                              <thead className="text-xs uppercase text-text-secondary">
                                <tr>
                                  <th className="py-2 pr-4 font-semibold">Subscriber</th>
                                  <th className="py-2 pr-4 font-semibold">Plan</th>
                                  <th className="py-2 font-semibold">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {holders.slice(0, 8).map((sub) => (
                                  <tr key={sub.id}>
                                    <td className="py-1.5 pr-4">
                                      {sub.users ? (
                                        <Link
                                          href={`/admin/people/${sub.users.id}`}
                                          className="hover:text-primary"
                                        >
                                          {sub.users.display_name}
                                        </Link>
                                      ) : (
                                        "User"
                                      )}
                                    </td>
                                    <td className="py-1.5 pr-4 text-text-secondary">
                                      {planTypeLabel(sub.plan_type)}
                                    </td>
                                    <td className="py-1.5">
                                      <StatusBadge tone={requestTone(sub.status)}>{sub.status}</StatusBadge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <Link
                              href={`/admin/stadiums/${row.id}`}
                              className="inline-flex text-xs font-medium text-primary hover:underline"
                            >
                              Open stadium workspace
                            </Link>
                          </div>
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
      </AdminTableShell>
      <StadiumEditModal
        stadium={editing}
        creating={creating}
        open={creating || Boolean(editing)}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSaved={async () => {
          await refresh();
        }}
      />
    </>
  );
}

