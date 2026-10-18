"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AdminCode, normalizeAdminCode } from "@/components/admin-code";
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
  eventStatusLabel,
  eventStatuses,
  eventVisibilityLabel,
  formatEventPrice,
  formatEventWhen,
} from "@/lib/events";
import { deleteAdmin, patchAdmin, postAdminResponse, adminFetch } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { EventRow, EventTicketRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

type EventSalesMap = Record<string, { sold: number; sales: number; currency: string }>;

export default function EventsPage() {
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("events:write");
  const [rows, setRows] = useState<EventRow[]>([]);
  const [salesByEvent, setSalesByEvent] = useState<EventSalesMap>({});
  const [tickets, setTickets] = useState<Pick<EventTicketRow, "id" | "event_id" | "ticket_code" | "ticket_number" | "status" | "users">[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
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
    const response = await adminFetch("/api/admin/events");
    const payload = (await response.json()) as {
      data?: EventRow[];
      sales?: EventSalesMap;
      tickets?: Pick<EventTicketRow, "id" | "event_id" | "ticket_code" | "ticket_number" | "status" | "users">[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load");
    setRows(payload.data ?? []);
    setSalesByEvent(payload.sales ?? {});
    setTickets(payload.tickets ?? []);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const ticketsByEvent = useMemo(() => {
    const map: Record<string, typeof tickets> = {};
    for (const ticket of tickets) {
      (map[ticket.event_id] ??= []).push(ticket);
    }
    return map;
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const codeQ = normalizeAdminCode(query);
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      const textMatch = [row.name, row.venue_name, row.location, row.slug]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      if (textMatch) return true;
      return (ticketsByEvent[row.id] ?? []).some((ticket) => {
        const code = normalizeAdminCode(ticket.ticket_code);
        const name = (ticket.users?.display_name ?? "").toLowerCase();
        return (codeQ && code.includes(codeQ)) || name.includes(q);
      });
    });
  }, [query, rows, status, ticketsByEvent]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, row) => {
        const sales = salesByEvent[row.id];
        acc.sold += sales?.sold ?? 0;
        acc.sales += sales?.sales ?? 0;
        return acc;
      },
      { sold: 0, sales: 0 },
    );
  }, [filtered, salesByEvent]);

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
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name, venue, buyer, or ticket code" />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            {eventStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading events…" /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty title="No events" description="Create an event to sell tickets." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Event</th>
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Sold</th>
                  <th className="px-4 py-3 font-semibold">Sales</th>
                  <th className="px-4 py-3 font-semibold">Upcoming</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const cover = eventCoverUrl(row);
                  const sales = salesByEvent[row.id];
                  const holders = ticketsByEvent[row.id] ?? [];
                  const open = expandedId === row.id;
                  const colSpan = canWrite ? 9 : 8;
                  return (
                    <Fragment key={row.id}>
                    <tr className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setExpandedId(open ? null : row.id)}
                            className="rounded p-1 text-text-secondary hover:bg-muted hover:text-text-primary"
                            aria-label={open ? "Hide ticket codes" : "Show ticket codes"}
                          >
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt="" className="h-11 w-16 shrink-0 rounded-md object-cover" />
                          ) : (
                            <div className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-text-secondary">
                              No img
                            </div>
                          )}
                          <div>
                            <Link href={`/admin/events/${row.id}`} className="font-medium hover:text-primary">
                              {row.name}
                            </Link>
                            <p className="text-xs text-text-secondary">
                              {row.venue_name || row.location || "—"}
                              {holders.length > 0 ? ` · ${holders.length} ticket code${holders.length === 1 ? "" : "s"}` : ""}
                              {` · ${eventCategoryLabel(row.category)} · ${eventVisibilityLabel(row.visibility)} · ${eventLifecycleLabel(row.lifecycle)}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatEventWhen(row.starts_at)}</td>
                      <td className="px-4 py-3">{formatEventPrice(row.ticket_price, row.currency)}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {sales?.sold ?? 0}
                        {row.capacity > 0 ? <span className="text-text-secondary"> / {row.capacity}</span> : null}
                      </td>
                      <td className="px-4 py-3 font-medium">{formatEventPrice(sales?.sales ?? 0, sales?.currency || row.currency)}</td>
                      <td className="px-4 py-3">
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => toggleUpcoming(row)}
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              row.is_upcoming
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-muted text-text-secondary hover:bg-muted/80"
                            }`}
                          >
                            {row.is_upcoming ? "Upcoming" : "Off"}
                          </button>
                        ) : row.is_upcoming ? (
                          <StatusBadge tone="success">Upcoming</StatusBadge>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={requestTone(row.status)}>{eventStatusLabel(row.status)}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                      {canWrite ? (
                        <td className="px-4 py-3">
                          <AdminTableActions canWrite onDelete={() => remove(row)} />
                        </td>
                      ) : null}
                    </tr>
                    {open ? (
                      <tr className="border-b border-border last:border-0">
                        <td colSpan={colSpan} className="bg-muted/30 px-4 py-3">
                          {holders.length === 0 ? (
                            <p className="text-sm text-text-secondary">No ticket codes yet.</p>
                          ) : (
                            <table className="min-w-full text-left text-sm">
                              <thead className="text-xs uppercase text-text-secondary">
                                <tr>
                                  <th className="py-2 pr-4 font-semibold">#</th>
                                  <th className="py-2 pr-4 font-semibold">Code</th>
                                  <th className="py-2 pr-4 font-semibold">Buyer</th>
                                  <th className="py-2 font-semibold">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {holders.map((ticket) => (
                                  <tr key={ticket.id}>
                                    <td className="py-1.5 pr-4 tabular-nums">{ticket.ticket_number || "—"}</td>
                                    <td className="py-1.5 pr-4">
                                      <AdminCode value={ticket.ticket_code} />
                                    </td>
                                    <td className="py-1.5 pr-4">
                                      {ticket.users ? (
                                        <Link href={`/admin/users/${ticket.users.id}`} className="hover:text-primary">
                                          {ticket.users.display_name}
                                        </Link>
                                      ) : (
                                        "Buyer"
                                      )}
                                    </td>
                                    <td className="py-1.5">
                                      <StatusBadge tone={requestTone(ticket.status)}>{ticket.status}</StatusBadge>
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
