"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminSearchInput,
  AdminSelect,
  AdminTableActions,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  clipboardImageFile,
  eventImageAccept,
  validateEventImageFile,
} from "@/lib/clipboard-image";
import {
  eventCategoryLabel,
  eventCoverUrl,
  eventLifecycleLabel,
  eventLifecycles,
  eventStatusLabel,
  eventStatuses,
  eventVisibilities,
  eventVisibilityLabel,
  formatEventPrice,
  formatEventWhenCompact,
} from "@/lib/events";
import { deleteAdmin, patchAdmin, postAdminResponse, adminFetch } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { EventRow } from "@/lib/types";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

type DirectoryEvent = EventRow & {
  pricing?: { label?: string; source?: string; legacy_fallback_used?: boolean };
  inventory?: {
    confirmed_sold?: number;
    reserved?: number;
    capacity?: number;
    available?: number | null;
    inside_now?: number;
  };
  verified_collections?: { amount?: string | number; currency?: string };
  organizer_name?: string;
};

export default function EventsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = can("events:write");
  const [rows, setRows] = useState<DirectoryEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(Number(searchParams.get("page") || "1") || 1);
  const [pageSize] = useState(40);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [lifecycle, setLifecycle] = useState(searchParams.get("lifecycle") || "all");
  const [visibility, setVisibility] = useState(searchParams.get("visibility") || "all");
  const [salesFilter, setSalesFilter] = useState(searchParams.get("sales") || "all");
  const [venueFilter, setVenueFilter] = useState(searchParams.get("venue") || "");
  const [organizerFilter, setOrganizerFilter] = useState(searchParams.get("organizer") || "");
  const [startsFrom, setStartsFrom] = useState(searchParams.get("starts_from") || "");
  const [startsTo, setStartsTo] = useState(searchParams.get("starts_to") || "");
  const [windowFilter, setWindowFilter] = useState(searchParams.get("window") || "");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverHint, setCoverHint] = useState<string | null>(null);
  const [coverDragOver, setCoverDragOver] = useState(false);
  const [form, setForm] = useState({
    name: "",
    venue_name: "",
    location: "",
    starts_at: "",
    ticket_price: "250",
    capacity: "0",
  });

  const clearCover = () => {
    setCoverFile(null);
    setCoverPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCoverHint(null);
  };

  const acceptCoverFile = (file: File | null) => {
    if (!file) return;
    const invalid = validateEventImageFile(file);
    if (invalid) {
      setCoverHint(invalid);
      return;
    }
    setCoverHint(null);
    setCoverPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setCoverFile(file);
  };

  const load = async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status !== "all") params.set("status", status);
    if (lifecycle !== "all") params.set("lifecycle", lifecycle);
    if (visibility !== "all") params.set("visibility", visibility);
    if (salesFilter !== "all") params.set("sales", salesFilter);
    if (venueFilter.trim()) params.set("venue", venueFilter.trim());
    if (organizerFilter.trim()) params.set("organizer", organizerFilter.trim());
    if (windowFilter) params.set("window", windowFilter);
    if (startsFrom) params.set("starts_from", startsFrom);
    if (startsTo) params.set("starts_to", startsTo);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    params.set("sort", "starts_at");
    params.set("order", "desc");

    const response = await adminFetch(`/api/admin/events?${params}`);
    const payload = (await response.json()) as {
      data?: DirectoryEvent[];
      total?: number;
      error?: string;
      message?: string;
      detail?: string;
    };
    if (!response.ok) {
      const msg =
        payload.message ||
        payload.detail ||
        (payload.error && !payload.error.includes("_") ? payload.error : null) ||
        payload.error ||
        "Failed to load events";
      throw new Error(msg === "not_found" ? "Events API unavailable. Retry in a moment." : msg);
    }
    setRows(payload.data ?? []);
    setTotal(Number(payload.total ?? 0));
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query,
    status,
    lifecycle,
    visibility,
    salesFilter,
    venueFilter,
    organizerFilter,
    windowFilter,
    startsFrom,
    startsTo,
    page,
    pageSize,
  ]);

  useEffect(() => {
    setQuery(searchParams.get("q") || "");
    setStatus(searchParams.get("status") || "all");
    setLifecycle(searchParams.get("lifecycle") || "all");
    setVisibility(searchParams.get("visibility") || "all");
    setSalesFilter(searchParams.get("sales") || "all");
    setVenueFilter(searchParams.get("venue") || "");
    setOrganizerFilter(searchParams.get("organizer") || "");
    setStartsFrom(searchParams.get("starts_from") || "");
    setStartsTo(searchParams.get("starts_to") || "");
    setWindowFilter(searchParams.get("window") || "");
    setPage(Number(searchParams.get("page") || "1") || 1);
  }, [searchParams]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (status !== "all") next.set("status", status);
    if (lifecycle !== "all") next.set("lifecycle", lifecycle);
    if (visibility !== "all") next.set("visibility", visibility);
    if (salesFilter !== "all") next.set("sales", salesFilter);
    if (venueFilter.trim()) next.set("venue", venueFilter.trim());
    if (organizerFilter.trim()) next.set("organizer", organizerFilter.trim());
    if (windowFilter) next.set("window", windowFilter);
    if (startsFrom) next.set("starts_from", startsFrom);
    if (startsTo) next.set("starts_to", startsTo);
    if (page > 1) next.set("page", String(page));
    const qs = next.toString();
    if (qs !== searchParams.toString()) {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query,
    status,
    lifecycle,
    visibility,
    salesFilter,
    venueFilter,
    organizerFilter,
    windowFilter,
    startsFrom,
    startsTo,
    page,
  ]);

  const filtered = rows;

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, row) => {
        acc.sold += row.inventory?.confirmed_sold ?? 0;
        acc.sales += Number(row.verified_collections?.amount ?? 0);
        return acc;
      },
      { sold: 0, sales: 0 },
    );
  }, [filtered]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setCreating(true);
    setError(null);
    setCoverHint(null);
    try {
      const payload = await postAdminResponse("/api/admin/events", {
        name: form.name,
        venue_name: form.venue_name,
        location: form.location,
        starts_at: form.starts_at,
        ticket_price: Number(form.ticket_price) || 0,
        capacity: Number(form.capacity) || 0,
        status: "active",
      });
      const created = payload.data as EventRow | undefined;
      if (created?.id && coverFile) {
        const body = new FormData();
        body.append("file", coverFile, coverFile.name);
        body.append("kind", "cover");
        const uploadRes = await adminFetch(`/api/admin/events/${created.id}/image`, {
          method: "POST",
          body,
        });
        const uploadPayload = (await uploadRes.json()) as { error?: string };
        if (!uploadRes.ok) {
          throw new Error(uploadPayload.error || "Event created, but cover upload failed.");
        }
      }
      setForm({ name: "", venue_name: "", location: "", starts_at: "", ticket_price: "250", capacity: "0" });
      clearCover();
      setCreateOpen(false);
      if (created?.id) {
        router.push(`/admin/events/${created.id}`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const toggleUpcoming = async (row: EventRow) => {
    if (!canWrite) return;
    setError(null);
    try {
      await patchAdmin(`/api/admin/events/${row.id}`, {
        is_upcoming: !row.is_upcoming,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const toggleFeatured = async (row: EventRow) => {
    if (!canWrite) return;
    setError(null);
    try {
      await patchAdmin(`/api/admin/events/${row.id}`, {
        is_featured: !row.is_featured,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove = async (row: EventRow) => {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/events/${row.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Events"
        description="Listings, tickets, and gate codes"
        actions={
          canWrite ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Add event
            </button>
          ) : null
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-hint">Events</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-hint">Tickets sold</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{totals.sold}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-border bg-card px-4 py-3 lg:col-span-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-hint">Total sales</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatEventPrice(totals.sales, "ETB")}</p>
        </div>
      </section>
      <AdminFilterPanel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AdminSearchInput
            value={query}
            onChange={(v) => {
              setPage(1);
              setQuery(v);
            }}
            placeholder="Search name, venue, organizer…"
          />
          <AdminSelect
            value={status}
            onChange={(v) => {
              setPage(1);
              setStatus(v);
            }}
          >
            <option value="all">All publication statuses</option>
            {eventStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={lifecycle}
            onChange={(v) => {
              setPage(1);
              setLifecycle(v);
            }}
          >
            <option value="all">All lifecycles</option>
            {eventLifecycles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={visibility}
            onChange={(v) => {
              setPage(1);
              setVisibility(v);
            }}
          >
            <option value="all">All visibility</option>
            {eventVisibilities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={salesFilter}
            onChange={(v) => {
              setPage(1);
              setSalesFilter(v);
            }}
          >
            <option value="all">All sales states</option>
            <option value="open">Sales open</option>
            <option value="closed">Sales closed</option>
            <option value="sold_out">Sold out</option>
          </AdminSelect>
          <AdminSearchInput
            value={venueFilter}
            onChange={(v) => {
              setPage(1);
              setVenueFilter(v);
            }}
            placeholder="Venue / location"
          />
          <AdminSearchInput
            value={organizerFilter}
            onChange={(v) => {
              setPage(1);
              setOrganizerFilter(v);
            }}
            placeholder="Organizer"
          />
        </div>
        {windowFilter === "upcoming_14d" || startsFrom ? (
          <p className="mt-2 text-[11px] text-text-hint">
            Native Apps upcoming-14-day filter active
            {startsFrom ? ` from ${startsFrom}` : ""}
            {startsTo ? ` to ${startsTo}` : ""} — excludes cancelled/ended/completed. Timezone
            Africa/Addis_Ababa.
          </p>
        ) : null}
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading events…" /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty title="No events" description="Create an event to sell tickets." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full table-fixed text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="w-[26%] px-4 py-3 font-semibold">Event</th>
                  <th className="w-[14%] px-4 py-3 font-semibold" title="Africa/Addis_Ababa">
                    When
                  </th>
                  <th
                    className="w-[12%] px-4 py-3 font-semibold"
                    title="Active tier prices; legacy ticket_price only if no active tiers"
                  >
                    Price
                  </th>
                  <th
                    className="w-[10%] px-4 py-3 font-semibold"
                    title="Confirmed paid quantity (pending reservations excluded)"
                  >
                    Sold
                  </th>
                  <th
                    className="w-[11%] px-4 py-3 font-semibold"
                    title="Verified payment collections only — pending checkouts excluded"
                  >
                    Collections
                  </th>
                  <th className="w-[8%] px-4 py-3 font-semibold">Promo</th>
                  <th className="w-[8%] px-4 py-3 font-semibold">Featured</th>
                  <th className="w-[8%] px-4 py-3 font-semibold">Status</th>
                  <th className="w-[13%] px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const cover = eventCoverUrl(row);
                  const sold = row.inventory?.confirmed_sold ?? 0;
                  const capacity = row.inventory?.capacity ?? row.capacity ?? 0;
                  const reserved = row.inventory?.reserved ?? 0;
                  const meta = [
                    row.organizer_name || null,
                    row.venue_name || row.location || null,
                    eventLifecycleLabel(row.lifecycle),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 align-middle">
                        <div className="flex min-w-0 items-center gap-3">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover}
                              alt=""
                              className="h-11 w-14 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-text-secondary">
                              No img
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/admin/events/${row.id}`}
                              className="block truncate font-medium text-text-primary hover:text-primary"
                              title={row.name}
                            >
                              {row.name}
                            </Link>
                            <p className="truncate text-xs text-text-hint" title={meta}>
                              {meta || "—"}
                            </p>
                            <p className="truncate text-[11px] text-text-hint">
                              {eventCategoryLabel(row.category)} · {eventVisibilityLabel(row.visibility)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-text-secondary whitespace-nowrap">
                        <span className="block">{formatEventWhenCompact(row.starts_at)}</span>
                        {row.ends_at ? (
                          <span className="mt-0.5 block text-text-hint">
                            → {formatEventWhenCompact(row.ends_at)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="block truncate font-medium" title={row.pricing?.label || undefined}>
                          {row.pricing?.label || formatEventPrice(row.ticket_price, row.currency)}
                        </span>
                        {row.pricing?.legacy_fallback_used ? (
                          <span className="mt-0.5 block truncate text-[10px] text-amber-700">Legacy</span>
                        ) : (
                          <span className="mt-0.5 block truncate text-[10px] text-text-hint">Tiers</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle tabular-nums text-xs whitespace-nowrap">
                        {sold}
                        {capacity > 0 ? <span className="text-text-secondary"> / {capacity}</span> : null}
                        {reserved > 0 ? (
                          <span className="mt-0.5 block text-[10px] text-text-hint">+{reserved} hold</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-middle font-medium text-xs whitespace-nowrap">
                        {formatEventPrice(
                          Number(row.verified_collections?.amount ?? 0),
                          row.verified_collections?.currency || row.currency,
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => toggleUpcoming(row)}
                            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                              row.is_upcoming
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-muted text-text-secondary hover:bg-muted/80"
                            }`}
                          >
                            {row.is_upcoming ? "On" : "Off"}
                          </button>
                        ) : row.is_upcoming ? (
                          <StatusBadge tone="success">On</StatusBadge>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => toggleFeatured(row)}
                            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                              row.is_featured
                                ? "bg-violet-100 text-violet-800"
                                : "bg-muted text-text-secondary hover:bg-muted/80"
                            }`}
                          >
                            {row.is_featured ? "On" : "Off"}
                          </button>
                        ) : row.is_featured ? (
                          <StatusBadge tone="info">On</StatusBadge>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <StatusBadge tone={requestTone(row.status)}>
                          {eventStatusLabel(row.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-nowrap items-center gap-2">
                          <Link
                            href={`/admin/events/${row.id}`}
                            className="whitespace-nowrap rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                          >
                            Open
                          </Link>
                          {canWrite ? (
                            <AdminTableActions canWrite onDelete={() => remove(row)} />
                          ) : null}
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
      {!loading && total > pageSize ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-text-secondary">
          <span>
            Page {page} · {filtered.length} shown · {total} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <AdminModal
        open={createOpen}
        title="Add event"
        onClose={() => {
          if (creating) return;
          clearCover();
          setCreateOpen(false);
        }}
        className="max-w-xl"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (creating) return;
                clearCover();
                setCreateOpen(false);
              }}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-event-form"
              disabled={creating}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {creating ? "Saving…" : "Create event"}
            </button>
          </div>
        }
      >
        <form id="create-event-form" onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Event name</span>
            <input
              required
              value={form.name}
              onChange={(changeEvent) => setForm({ ...form, name: changeEvent.target.value })}
              className={fieldClass}
            />
          </label>
          <div className="grid gap-1 text-sm sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-secondary">Cover image</span>
              {coverFile ? (
                <button
                  type="button"
                  disabled={creating}
                  onClick={clearCover}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <div
              tabIndex={0}
              role="button"
              aria-label="Paste or drop event cover image"
              onPaste={(pasteEvent) => {
                const file = clipboardImageFile(pasteEvent.clipboardData);
                if (!file) return;
                pasteEvent.preventDefault();
                acceptCoverFile(file);
              }}
              onDragEnter={(dragEvent) => {
                dragEvent.preventDefault();
                if (!creating) setCoverDragOver(true);
              }}
              onDragOver={(dragEvent) => {
                dragEvent.preventDefault();
                if (!creating) setCoverDragOver(true);
              }}
              onDragLeave={() => setCoverDragOver(false)}
              onDrop={(dropEvent) => {
                dropEvent.preventDefault();
                setCoverDragOver(false);
                acceptCoverFile(clipboardImageFile(dropEvent.dataTransfer));
              }}
              className={`overflow-hidden rounded-lg border border-dashed outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                coverDragOver ? "border-primary bg-primary/10" : "border-border bg-muted/40"
              }`}
            >
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverPreview}
                  alt=""
                  className="h-40 w-full bg-black/80 object-contain"
                />
              ) : (
                <div className="flex h-28 flex-col items-center justify-center gap-1 px-3 text-center text-xs text-text-secondary">
                  <span>
                    {coverDragOver
                      ? "Drop image to use as cover"
                      : "Paste (⌘V / Ctrl+V) or drop a cover image"}
                  </span>
                  <span className="text-[11px] text-text-hint">JPG, PNG, WebP, or GIF · max 5 MB</span>
                </div>
              )}
            </div>
            {coverHint ? <p className="text-xs text-red-600">{coverHint}</p> : null}
            <input
              type="file"
              accept={eventImageAccept}
              disabled={creating}
              className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
              onChange={(changeEvent) => {
                const file = changeEvent.target.files?.[0] ?? null;
                acceptCoverFile(file);
                changeEvent.target.value = "";
              }}
            />
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Venue</span>
            <input
              value={form.venue_name}
              onChange={(changeEvent) => setForm({ ...form, venue_name: changeEvent.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">City</span>
            <input
              value={form.location}
              onChange={(changeEvent) => setForm({ ...form, location: changeEvent.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Starts</span>
            <input
              required
              type="datetime-local"
              value={form.starts_at}
              onChange={(changeEvent) => setForm({ ...form, starts_at: changeEvent.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Ticket price (ETB)</span>
            <input
              type="number"
              min={0}
              value={form.ticket_price}
              onChange={(changeEvent) => setForm({ ...form, ticket_price: changeEvent.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Capacity</span>
            <input
              type="number"
              min={0}
              value={form.capacity}
              onChange={(changeEvent) => setForm({ ...form, capacity: changeEvent.target.value })}
              className={fieldClass}
            />
          </label>
        </form>
      </AdminModal>
    </>
  );
}
