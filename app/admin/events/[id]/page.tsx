"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminModal,
  AdminTableShell,
} from "@/components/admin-layout";
import { AdminCode } from "@/components/admin-code";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { VisiblePassword } from "@/components/visible-password";
import {
  eventCategories,
  eventCategoryLabel,
  eventCoverUrl,
  eventDateInput,
  eventLifecycleLabel,
  eventLifecycles,
  eventPhotoUrls,
  eventRsvpStatusLabel,
  eventRsvpStatuses,
  eventSalesByTier,
  eventStatusLabel,
  eventStatuses,
  eventTicketSales,
  eventVisibilityLabel,
  eventVisibilities,
  formatEventPrice,
  formatEventWhen,
  normalizeTicketCode,
  ticketIsInside,
} from "@/lib/events";
import { generateStadiumManagerPassword } from "@/lib/stadiums";
import { adminFetch, deleteAdmin, patchAdmin, postAdminResponse } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type {
  EventManagerRow,
  EventRow,
  EventRsvpRow,
  EventTicketRow,
  EventTicketTierRow,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "tiers", label: "Ticket tiers" },
  { id: "tickets", label: "Tickets" },
  { id: "rsvps", label: "RSVPs" },
  { id: "managers", label: "Managers" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, staff } = useAdminPermissions();
  const canWrite = can("events:write");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [event, setEvent] = useState<EventRow | null>(null);
  const [tickets, setTickets] = useState<EventTicketRow[]>([]);
  const [tiers, setTiers] = useState<EventTicketTierRow[]>([]);
  const [rsvps, setRsvps] = useState<EventRsvpRow[]>([]);
  const [managers, setManagers] = useState<EventManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"cover" | "gallery" | null>(null);
  const [tierOpen, setTierOpen] = useState(false);
  const [savingTier, setSavingTier] = useState(false);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [tierForm, setTierForm] = useState({
    name: "General Admission",
    description: "",
    price: "500",
    capacity: "0",
    max_per_user: "10",
    benefits: "",
    sort_order: "0",
    is_active: true,
  });
  const [rsvpEmail, setRsvpEmail] = useState("");
  const [savingRsvp, setSavingRsvp] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [savingManager, setSavingManager] = useState(false);
  const [managerForm, setManagerForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: generateStadiumManagerPassword(),
    manager_role: "manager",
  });
  const [createdLogin, setCreatedLogin] = useState<{ email: string; password: string } | null>(null);

  const load = async () => {
    const supabase = getSupabase();
    const [eventRes, ticketRes, managerRes, tiersRes, rsvpsRes] = await Promise.all([
      supabase.from("events").select("*").eq("id", id).maybeSingle(),
      adminFetch(`/api/admin/events/${id}/tickets`),
      adminFetch(`/api/admin/events/${id}/managers`),
      adminFetch(`/api/admin/events/${id}/tiers`),
      adminFetch(`/api/admin/events/${id}/rsvps`),
    ]);
    if (eventRes.error) throw eventRes.error;
    setEvent(eventRes.data as EventRow | null);
    const ticketPayload = (await ticketRes.json()) as { data?: EventTicketRow[]; error?: string };
    if (!ticketRes.ok) throw new Error(ticketPayload.error || "Failed to load tickets");
    setTickets(ticketPayload.data ?? []);
    const managerPayload = (await managerRes.json()) as { data?: EventManagerRow[]; error?: string };
    if (!managerRes.ok) throw new Error(managerPayload.error || "Failed to load managers");
    setManagers(managerPayload.data ?? []);
    const tiersPayload = (await tiersRes.json()) as { data?: EventTicketTierRow[]; error?: string };
    setTiers(tiersRes.ok ? tiersPayload.data ?? [] : []);
    const rsvpsPayload = (await rsvpsRes.json()) as { data?: EventRsvpRow[]; error?: string };
    setRsvps(rsvpsRes.ok ? rsvpsPayload.data ?? [] : []);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sales = useMemo(
    () => eventTicketSales(tickets, event?.currency || "ETB"),
    [event?.currency, tickets],
  );
  const tierSales = useMemo(
    () => eventSalesByTier(tickets, tiers, event?.currency || "ETB"),
    [event?.currency, tickets, tiers],
  );
  const remaining = event && event.capacity > 0 ? Math.max(0, event.capacity - sales.sold) : null;
  const cover = event ? eventCoverUrl(event) : "";
  const gallery = event ? eventPhotoUrls(event.photos).filter((url) => url !== cover) : [];
  const checkInPct =
    sales.sold > 0 ? Math.round((sales.inside / sales.sold) * 100) : 0;

  const filteredTickets = useMemo(() => {
    const q = normalizeTicketCode(code);
    if (!q) return tickets;
    return tickets.filter((row) => row.ticket_code.toUpperCase().includes(q));
  }, [code, tickets]);

  const openNewTier = () => {
    setEditingTierId(null);
    setTierForm({
      name: "General Admission",
      description: "",
      price: `${event?.ticket_price ?? 500}`,
      capacity: "0",
      max_per_user: "10",
      benefits: "",
      sort_order: `${tiers.length}`,
      is_active: true,
    });
    setTierOpen(true);
  };

  const openEditTier = (tier: EventTicketTierRow) => {
    setEditingTierId(tier.id);
    setTierForm({
      name: tier.name,
      description: tier.description ?? "",
      price: `${tier.price}`,
      capacity: `${tier.capacity}`,
      max_per_user: `${tier.max_per_user}`,
      benefits: tier.benefits ?? "",
      sort_order: `${tier.sort_order}`,
      is_active: tier.is_active !== false,
    });
    setTierOpen(true);
  };

  const saveTier = async (formEvent?: React.FormEvent) => {
    formEvent?.preventDefault();
    if (!canWrite) return;
    setSavingTier(true);
    setError(null);
    try {
      const payload = {
        name: tierForm.name.trim(),
        description: tierForm.description.trim(),
        price: Number(tierForm.price) || 0,
        currency: event?.currency || "ETB",
        capacity: Number(tierForm.capacity) || 0,
        max_per_user: Math.max(1, Number(tierForm.max_per_user) || 10),
        benefits: tierForm.benefits.trim(),
        sort_order: Number(tierForm.sort_order) || 0,
        is_active: tierForm.is_active,
      };
      if (editingTierId) {
        await patchAdmin(`/api/admin/events/${id}/tiers/${editingTierId}`, payload);
      } else {
        await postAdminResponse(`/api/admin/events/${id}/tiers`, payload);
      }
      setTierOpen(false);
      await load();
      setNotice(editingTierId ? "Tier updated." : "Tier created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save tier");
    } finally {
      setSavingTier(false);
    }
  };

  const removeTier = async (tier: EventTicketTierRow) => {
    if (!canWrite || !window.confirm(`Delete tier "${tier.name}"?`)) return;
    try {
      await deleteAdmin(`/api/admin/events/${id}/tiers/${tier.id}`);
      await load();
      setNotice("Tier deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const inviteRsvp = async (formEvent?: React.FormEvent) => {
    formEvent?.preventDefault();
    if (!canWrite || !rsvpEmail.trim()) return;
    setSavingRsvp(true);
    setError(null);
    try {
      await postAdminResponse(`/api/admin/events/${id}/rsvps`, {
        email: rsvpEmail.trim(),
        status: "invited",
      });
      setRsvpEmail("");
      await load();
      setNotice("Invitation added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not invite");
    } finally {
      setSavingRsvp(false);
    }
  };

  const updateRsvp = async (rsvpId: string, status: string) => {
    if (!canWrite) return;
    try {
      await patchAdmin(`/api/admin/events/${id}/rsvps`, { rsvp_id: rsvpId, status });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const removeRsvp = async (rsvpId: string) => {
    if (!canWrite || !window.confirm("Remove this RSVP?")) return;
    try {
      const response = await adminFetch(`/api/admin/events/${id}/rsvps?rsvp_id=${rsvpId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Remove failed");
      await load();
      setNotice("RSVP removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  };

  const save = async (patch: Record<string, unknown>) => {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await patchAdmin(`/api/admin/events/${id}`, patch);
      await load();
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File, kind: "cover" | "gallery") => {
    setUploading(kind);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      const response = await adminFetch(`/api/admin/events/${id}/image`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      await load();
      setNotice(kind === "cover" ? "Cover image updated." : "Photo added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
      if (kind === "cover" && coverInputRef.current) coverInputRef.current.value = "";
      if (kind === "gallery" && galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const removePhoto = async (url: string) => {
    if (!event || !canWrite) return;
    const photos = eventPhotoUrls(event.photos).filter((item) => item !== url);
    const nextCover = event.image_url === url ? photos[0] ?? "" : event.image_url;
    await save({ photos, image_url: nextCover });
  };

  const gate = async (ticketId: string, action: "checkin" | "checkout") => {
    setError(null);
    try {
      await patchAdmin(`/api/admin/events/${id}/tickets/${ticketId}`, { action });
      await load();
      setNotice(action === "checkin" ? "Checked in." : "Checked out.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const createManager = async (formEvent?: React.FormEvent) => {
    formEvent?.preventDefault();
    if (!canWrite) return;
    setSavingManager(true);
    setError(null);
    setCreatedLogin(null);
    try {
      const email = managerForm.email.trim().toLowerCase();
      const adminEmail = (staff?.email ?? "").trim().toLowerCase();
      if (adminEmail && email === adminEmail) {
        throw new Error("Use a different email for the event manager.");
      }
      const payload = await postAdminResponse(`/api/admin/events/${id}/managers`, {
        ...managerForm,
        full_name: managerForm.full_name.trim(),
        email,
        password: managerForm.password.trim(),
      });
      const password = `${payload.password ?? managerForm.password}`;
      setCreatedLogin({ email, password });
      setManagerForm({
        full_name: "",
        email: "",
        phone: "",
        password: generateStadiumManagerPassword(),
        manager_role: "manager",
      });
      await load();
      setNotice(`Manager login created. Email ${email} · Password ${password}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add manager");
    } finally {
      setSavingManager(false);
    }
  };

  const resetManagerPassword = async (row: EventManagerRow) => {
    if (!canWrite) return;
    const next = window.prompt("New password (leave empty to auto-generate)", row.login_password || "") ?? null;
    if (next === null) return;
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/events/${id}/managers/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_password: true, password: next.trim() }),
      });
      const payload = (await response.json()) as { error?: string; password?: string };
      if (!response.ok) throw new Error(payload.error || "Reset failed");
      await load();
      setNotice(`Password updated: ${payload.password ?? next}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  };

  const toggleManager = async (row: EventManagerRow) => {
    if (!canWrite) return;
    try {
      await patchAdmin(`/api/admin/events/${id}/managers/${row.id}`, { is_active: !row.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const removeManager = async (row: EventManagerRow) => {
    if (!canWrite || !window.confirm(`Remove ${row.users?.display_name || "this manager"} from this event?`)) {
      return;
    }
    try {
      await deleteAdmin(`/api/admin/events/${id}/managers/${row.id}`);
      await load();
      setNotice("Manager removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  };

  if (loading) return <AdminLoadingRow label="Loading event…" />;
  if (!event) return <AdminErrorAlert message={error || "Event not found"} />;

  return (
    <>
      <AdminPageHeader
        title={event.name}
        description={`${event.venue_name || event.location || "Event"} · ${formatEventWhen(event.starts_at)}`}
        backHref="/admin/events"
        breadcrumbs={[
          { label: "Events", href: "/admin/events" },
          { label: event.name },
        ]}
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              {event.status !== "active" ? (
                <button
                  type="button"
                  onClick={() => save({ status: "active" })}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Activate
                </button>
              ) : null}
              {event.status !== "inactive" ? (
                <button
                  type="button"
                  onClick={() => save({ status: "inactive" })}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Deactivate
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => save({ is_upcoming: !event.is_upcoming })}
                className={`rounded-md border px-3 py-2 text-sm font-medium ${
                  event.is_upcoming
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    : "border-border bg-card hover:bg-muted"
                }`}
              >
                {event.is_upcoming ? "Upcoming: On" : "Mark upcoming"}
              </button>
              <button
                type="button"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                onClick={async () => {
                  if (!window.confirm(`Delete "${event.name}"? This cannot be undone.`)) return;
                  await deleteAdmin(`/api/admin/events/${id}`);
                  router.replace("/admin/events");
                }}
              >
                Delete
              </button>
            </div>
          ) : null
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-2.5 text-sm font-medium ${
              tab === item.id
                ? "border-b-2 border-primary text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {item.label}
            {item.id === "tiers" ? ` (${tiers.length})` : null}
            {item.id === "tickets" ? ` (${tickets.length})` : null}
            {item.id === "rsvps" ? ` (${rsvps.length})` : null}
            {item.id === "managers" ? ` (${managers.length})` : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h2 className="font-heading text-sm font-semibold">Ticket sales</h2>
              <p className="text-xs text-text-hint">Confirmed and used tickets</p>
            </div>
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-5 sm:divide-x sm:divide-y-0">
              {[
                { label: "Sold", hint: event.capacity > 0 ? `of ${event.capacity} capacity` : "Paid tickets", value: `${sales.sold}` },
                { label: "Total sales", hint: sales.currency, value: formatEventPrice(sales.sales, sales.currency) },
                { label: "Inside", hint: "Checked in now", value: `${sales.inside}` },
                { label: "Check-in %", hint: "Of sold tickets", value: `${checkInPct}%` },
                { label: "Remaining", hint: remaining == null ? "No cap" : "Seats left", value: remaining == null ? "—" : `${remaining}` },
              ].map((item) => (
                <div key={item.label} className="py-4 first:pt-0 last:pb-0 sm:px-5 sm:py-1 sm:first:pl-0 sm:last:pr-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-hint">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-text-primary">{item.value}</p>
                  <p className="mt-1 text-xs text-text-secondary">{item.hint}</p>
                </div>
              ))}
            </div>
            {tierSales.length > 0 ? (
              <div className="mt-5 border-t border-border pt-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-hint">
                  Sales by ticket tier
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {tierSales.map((row) => (
                    <div key={row.tierId} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                      <p className="text-sm font-semibold">{row.name}</p>
                      <p className="mt-1 text-xs text-text-secondary">
                        Sold {row.sold}
                        {row.capacity > 0 ? ` / ${row.capacity}` : ""} · {formatEventPrice(row.revenue, row.currency)}
                      </p>
                      <p className="text-xs text-text-hint">Checked in {row.checkedIn}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-sm font-semibold">Images</h2>
                <StatusBadge tone={requestTone(event.status)}>{eventStatusLabel(event.status)}</StatusBadge>
              </div>
              {cover ? (
                <div className="relative mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover} alt="" className="h-56 w-full rounded-xl object-cover" />
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => removePhoto(cover)}
                      className="absolute right-3 top-3 rounded-md bg-black/70 px-2.5 py-1.5 text-xs font-medium text-white"
                    >
                      Remove cover
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="mb-4 flex h-56 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-sm text-text-secondary">
                  No cover image yet
                </div>
              )}
              {canWrite ? (
                <div className="mb-5">
                  <p className="mb-1 text-sm font-medium">Cover image</p>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={Boolean(uploading)}
                    onChange={(changeEvent) => {
                      const file = changeEvent.target.files?.[0];
                      if (file) void uploadImage(file, "cover");
                    }}
                    className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                  />
                  <p className="mt-1 text-xs text-text-secondary">JPG, PNG, WebP, or GIF · max 5 MB</p>
                  {uploading === "cover" ? <p className="mt-1 text-xs text-text-secondary">Uploading cover…</p> : null}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">Gallery</h3>
                {canWrite ? (
                  <label className="cursor-pointer text-sm font-medium text-primary">
                    {uploading === "gallery" ? "Uploading…" : "Add photos"}
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      disabled={Boolean(uploading)}
                      className="hidden"
                      onChange={async (changeEvent) => {
                        const files = Array.from(changeEvent.target.files ?? []);
                        for (const file of files) await uploadImage(file, "gallery");
                      }}
                    />
                  </label>
                ) : null}
              </div>
              {gallery.length === 0 ? (
                <p className="mt-3 text-sm text-text-secondary">No extra photos yet. Add images fans will see on the event.</p>
              ) : (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {gallery.map((url) => (
                    <li key={url} className="group relative overflow-hidden rounded-lg border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-28 w-full object-cover" />
                      {canWrite ? (
                        <button
                          type="button"
                          onClick={() => removePhoto(url)}
                          className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white opacity-0 group-hover:opacity-100"
                        >
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-4 font-heading text-sm font-semibold">Details</h2>
              <form
                key={event.updated_at}
                className="grid gap-3"
                onSubmit={(formEvent) => {
                  formEvent.preventDefault();
                  const data = new FormData(formEvent.currentTarget);
                  save({
                    name: data.get("name"),
                    venue_name: data.get("venue_name"),
                    location: data.get("location"),
                    address: data.get("address"),
                    starts_at: data.get("starts_at"),
                    ends_at: data.get("ends_at") || null,
                    ticket_price: Number(data.get("ticket_price") || 0),
                    capacity: Number(data.get("capacity") || 0),
                    description: data.get("description"),
                    status: data.get("status"),
                    is_upcoming: data.get("is_upcoming") === "on",
                    category: data.get("category"),
                    visibility: data.get("visibility"),
                    lifecycle: data.get("lifecycle"),
                    service_fee_percent: Number(data.get("service_fee_percent") || 0),
                    important_info: data.get("important_info"),
                    entry_rules: data.get("entry_rules"),
                    organizer_name: data.get("organizer_name"),
                    organizer_info: data.get("organizer_info"),
                    sales_starts_at: data.get("sales_starts_at") || null,
                    sales_ends_at: data.get("sales_ends_at") || null,
                  });
                }}
              >
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Name</span>
                  <input name="name" defaultValue={event.name} className={fieldClass} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Venue</span>
                  <input name="venue_name" defaultValue={event.venue_name} className={fieldClass} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">City</span>
                    <input name="location" defaultValue={event.location} className={fieldClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Address</span>
                    <input name="address" defaultValue={event.address} className={fieldClass} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Starts</span>
                    <input name="starts_at" type="datetime-local" defaultValue={eventDateInput(event.starts_at)} className={fieldClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Ends</span>
                    <input name="ends_at" type="datetime-local" defaultValue={eventDateInput(event.ends_at)} className={fieldClass} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Category</span>
                    <select name="category" defaultValue={event.category || "other"} className={fieldClass}>
                      {eventCategories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Visibility</span>
                    <select name="visibility" defaultValue={event.visibility || "public"} className={fieldClass}>
                      {eventVisibilities.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Lifecycle</span>
                    <select name="lifecycle" defaultValue={event.lifecycle || "sales_open"} className={fieldClass}>
                      {eventLifecycles.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Sales start</span>
                    <input
                      name="sales_starts_at"
                      type="datetime-local"
                      defaultValue={eventDateInput(event.sales_starts_at)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Sales end</span>
                    <input
                      name="sales_ends_at"
                      type="datetime-local"
                      defaultValue={eventDateInput(event.sales_ends_at)}
                      className={fieldClass}
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Legacy price</span>
                    <input name="ticket_price" type="number" min={0} defaultValue={event.ticket_price} className={fieldClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Capacity</span>
                    <input name="capacity" type="number" min={0} defaultValue={event.capacity} className={fieldClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Service fee %</span>
                    <input
                      name="service_fee_percent"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      defaultValue={event.service_fee_percent ?? 0}
                      className={fieldClass}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Status</span>
                    <select name="status" defaultValue={event.status} className={fieldClass}>
                      {eventStatuses.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-xs text-text-hint">
                  Prefer ticket tiers for pricing. Legacy price is used only when no tiers exist.
                </p>
                <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm">
                  <input
                    name="is_upcoming"
                    type="checkbox"
                    defaultChecked={Boolean(event.is_upcoming)}
                    className="mt-0.5 h-4 w-4 rounded border-border"
                  />
                  <span>
                    <span className="font-medium text-text-primary">Show in Upcoming Events</span>
                    <span className="mt-0.5 block text-xs text-text-secondary">
                      Lists this event in the Spojex app Upcoming Events horizontal rail.
                    </span>
                  </span>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Description</span>
                  <textarea name="description" defaultValue={event.description} rows={3} className="rounded-lg border border-border px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Important info</span>
                  <textarea
                    name="important_info"
                    defaultValue={event.important_info ?? ""}
                    rows={2}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Entry rules</span>
                  <textarea
                    name="entry_rules"
                    defaultValue={event.entry_rules ?? ""}
                    rows={2}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Organizer name</span>
                    <input
                      name="organizer_name"
                      defaultValue={event.organizer_name ?? ""}
                      className={fieldClass}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Organizer info</span>
                    <input
                      name="organizer_info"
                      defaultValue={event.organizer_info ?? ""}
                      className={fieldClass}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                  <span className="rounded-full border border-border px-2.5 py-1">
                    {eventCategoryLabel(event.category)}
                  </span>
                  <span className="rounded-full border border-border px-2.5 py-1">
                    {eventVisibilityLabel(event.visibility)}
                  </span>
                  <span className="rounded-full border border-border px-2.5 py-1">
                    {eventLifecycleLabel(event.lifecycle)}
                  </span>
                </div>
                {canWrite ? (
                  <button type="submit" disabled={saving} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    {saving ? "Saving…" : "Save event"}
                  </button>
                ) : null}
              </form>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "tiers" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-sm font-semibold">Ticket tiers</h2>
              <p className="text-xs text-text-secondary">
                Configure GA, VIP, VVIP, Student, or any custom tiers. The app renders whatever you add here.
              </p>
            </div>
            {canWrite ? (
              <button
                type="button"
                onClick={openNewTier}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Add tier
              </button>
            ) : null}
          </div>
          {tiers.length === 0 ? (
            <AdminEmpty
              title="No ticket tiers yet"
              description="Add tiers for multi-price events, or leave empty to use the legacy single ticket price."
            />
          ) : (
            <AdminTableShell>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-hint">
                    <th className="px-3 py-2">Tier</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Sold / Cap</th>
                    <th className="px-3 py-2">Max / user</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((tier) => (
                    <tr key={tier.id} className="border-b border-border/70">
                      <td className="px-3 py-3">
                        <p className="font-medium">{tier.name}</p>
                        {tier.description ? (
                          <p className="text-xs text-text-secondary">{tier.description}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {formatEventPrice(tier.price, tier.currency)}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {tier.sold ?? 0}
                        {tier.capacity > 0 ? ` / ${tier.capacity}` : " / ∞"}
                      </td>
                      <td className="px-3 py-3 tabular-nums">{tier.max_per_user}</td>
                      <td className="px-3 py-3">
                        <StatusBadge tone={tier.is_active ? "success" : "neutral"}>
                          {tier.is_active ? "Active" : "Inactive"}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {canWrite ? (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditTier(tier)}
                              className="text-sm font-medium text-primary"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => removeTier(tier)}
                              className="text-sm font-medium text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableShell>
          )}
        </div>
      ) : null}

      {tab === "tickets" ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h2 className="font-heading text-sm font-semibold">Sales</h2>
              <p className="text-xs text-text-hint">{formatEventPrice(event.ticket_price, event.currency)} per ticket</p>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-xl bg-muted/40 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-hint">Tickets sold</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{sales.sold}</p>
              </div>
              <div className="rounded-xl bg-muted/40 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-hint">Total sales</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{formatEventPrice(sales.sales, sales.currency)}</p>
              </div>
              <div className="rounded-xl bg-muted/40 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-hint">Inside now</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{sales.inside}</p>
              </div>
              <div className="rounded-xl bg-muted/40 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-hint">Pending</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{sales.pending}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-sm font-semibold">Paid tickets</h2>
                <p className="mt-1 text-sm text-text-secondary">Search the 6-character gate code, then check the buyer in or out.</p>
              </div>
              <input
                value={code}
                onChange={(changeEvent) => setCode(changeEvent.target.value)}
                placeholder="Search code"
                className="h-10 w-48 rounded-lg border border-border px-3 text-sm tracking-widest"
              />
            </div>
            {filteredTickets.length === 0 ? (
              <AdminEmpty title="No tickets" description={code ? "No tickets match that code." : "Paid tickets will appear here."} />
            ) : (
              <AdminTableShell>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-semibold">#</th>
                        <th className="px-4 py-3 font-semibold">Code</th>
                        <th className="px-4 py-3 font-semibold">Buyer</th>
                        <th className="px-4 py-3 font-semibold">Qty</th>
                        <th className="px-4 py-3 font-semibold">Paid</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Bought</th>
                        {canWrite ? <th className="px-4 py-3 font-semibold">Gate</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTickets.map((row) => {
                        const inside = ticketIsInside(row);
                        return (
                          <tr key={row.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 tabular-nums">{row.ticket_number || "—"}</td>
                            <td className="px-4 py-3">
                              <AdminCode value={row.ticket_code} />
                              {row.tier_name ? (
                                <p className="mt-1 text-xs text-text-secondary">{row.tier_name}</p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              {row.users ? (
                                <Link href={`/admin/users/${row.users.id}`} className="font-medium hover:text-primary">
                                  {row.users.display_name}
                                </Link>
                              ) : (
                                <span>{row.guest_name || "Buyer"}</span>
                              )}
                              <p className="text-xs text-text-secondary">{row.users?.email || row.guest_phone || "—"}</p>
                            </td>
                            <td className="px-4 py-3 tabular-nums">{row.quantity}</td>
                            <td className="px-4 py-3 font-medium">{formatEventPrice(row.amount, row.currency)}</td>
                            <td className="px-4 py-3">
                              <StatusBadge tone={inside ? "success" : requestTone(row.status)}>
                                {inside ? "Inside" : row.status}
                              </StatusBadge>
                            </td>
                            <td className="px-4 py-3 text-text-secondary">{formatDateTime(row.created_at)}</td>
                            {canWrite ? (
                              <td className="px-4 py-3">
                                {row.status === "confirmed" || row.status === "used" ? (
                                  inside ? (
                                    <button type="button" className="text-sm font-medium text-primary" onClick={() => gate(row.id, "checkout")}>
                                      Check out
                                    </button>
                                  ) : (
                                    <button type="button" className="text-sm font-medium text-primary" onClick={() => gate(row.id, "checkin")}>
                                      Check in
                                    </button>
                                  )
                                ) : (
                                  <span className="text-text-secondary">—</span>
                                )}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </AdminTableShell>
            )}
          </section>
        </div>
      ) : null}

      {tab === "rsvps" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-sm font-semibold">Private event RSVPs</h2>
              <p className="text-xs text-text-secondary">
                Invite Spojex users by email. Private events stay out of public discovery.
              </p>
            </div>
            {canWrite ? (
              <form onSubmit={inviteRsvp} className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">User email</span>
                  <input
                    value={rsvpEmail}
                    onChange={(e) => setRsvpEmail(e.target.value)}
                    type="email"
                    required
                    placeholder="fan@example.com"
                    className={`${fieldClass} min-w-[220px]`}
                  />
                </label>
                <button
                  type="submit"
                  disabled={savingRsvp}
                  className="h-10 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {savingRsvp ? "Inviting…" : "Invite"}
                </button>
              </form>
            ) : null}
          </div>
          {rsvps.length === 0 ? (
            <AdminEmpty title="No RSVPs" description="Invite guests for private events here." />
          ) : (
            <AdminTableShell>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-hint">
                    <th className="px-3 py-2">Guest</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Invited</th>
                    <th className="px-3 py-2">Responded</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rsvps.map((row) => (
                    <tr key={row.id} className="border-b border-border/70">
                      <td className="px-3 py-3">
                        {row.users ? (
                          <Link href={`/admin/users/${row.users.id}`} className="font-medium hover:text-primary">
                            {row.users.display_name}
                          </Link>
                        ) : (
                          <span>User</span>
                        )}
                        <p className="text-xs text-text-secondary">{row.users?.email || "—"}</p>
                      </td>
                      <td className="px-3 py-3">
                        {canWrite ? (
                          <select
                            value={row.status}
                            onChange={(e) => updateRsvp(row.id, e.target.value)}
                            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                          >
                            {eventRsvpStatuses.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          eventRsvpStatusLabel(row.status)
                        )}
                      </td>
                      <td className="px-3 py-3 text-text-secondary">{formatDateTime(row.invited_at)}</td>
                      <td className="px-3 py-3 text-text-secondary">
                        {row.responded_at ? formatDateTime(row.responded_at) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => removeRsvp(row.id)}
                            className="text-sm font-medium text-red-600"
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableShell>
          )}
        </div>
      ) : null}

      {tab === "managers" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-sm font-semibold">Assigned managers</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Managers sign in to the app, open Events → Manage, and search paying tickets by code.
                </p>
              </div>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => {
                    setCreatedLogin(null);
                    setError(null);
                    setManagerOpen(true);
                  }}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  Create manager login
                </button>
              ) : null}
            </div>
            {managers.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No managers assigned yet.{canWrite ? " Use Create manager login to add one." : ""}
              </p>
            ) : (
              <AdminTableShell>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold">Email</th>
                        <th className="px-4 py-3 font-semibold">Password</th>
                        <th className="px-4 py-3 font-semibold">Role</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {managers.map((row) => (
                        <tr key={row.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            {row.users ? (
                              <Link href={`/admin/users/${row.users.id}`} className="font-medium text-primary">
                                {row.users.display_name}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{row.users?.email || "—"}</td>
                          <td className="px-4 py-3">
                            <VisiblePassword value={row.login_password} />
                          </td>
                          <td className="px-4 py-3 text-text-secondary">{row.manager_role}</td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={row.is_active ? "success" : "neutral"}>
                              {row.is_active ? "Active" : "Inactive"}
                            </StatusBadge>
                          </td>
                          {canWrite ? (
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => resetManagerPassword(row)} className="text-sm text-primary">
                                  Reset password
                                </button>
                                <button type="button" onClick={() => toggleManager(row)} className="text-sm text-text-secondary">
                                  {row.is_active ? "Deactivate" : "Activate"}
                                </button>
                                <button type="button" onClick={() => removeManager(row)} className="text-sm text-red-600">
                                  Remove
                                </button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AdminTableShell>
            )}
          </section>
        </div>
      ) : null}

      <AdminModal
        open={managerOpen}
        title={createdLogin ? "Manager login created" : "Create manager login"}
        onClose={() => {
          if (savingManager) return;
          setManagerOpen(false);
        }}
        className="max-w-2xl"
        footer={
          createdLogin ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setManagerOpen(false)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setManagerOpen(false)}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-event-manager-form"
                disabled={savingManager}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {savingManager ? "Creating…" : "Create manager"}
              </button>
            </div>
          )
        }
      >
        {createdLogin ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Share these login details with the manager</p>
            <p className="mt-2">
              Email: <span className="font-mono">{createdLogin.email}</span>
            </p>
            <p className="mt-1">
              Password: <VisiblePassword value={createdLogin.password} />
            </p>
            <p className="mt-2 text-xs text-emerald-800">
              They sign in to the SpoJex app. The Manage tab appears only for this event.
            </p>
          </div>
        ) : (
          <form id="create-event-manager-form" onSubmit={(formEvent) => void createManager(formEvent)} className="grid gap-3 md:grid-cols-2">
            <p className="text-sm text-text-secondary md:col-span-2">
              Creates a SpoJex app login and assigns it to this event. Use a{" "}
              <span className="font-medium text-text-primary">different email than your admin account</span>.
            </p>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Full name</span>
              <input
                value={managerForm.full_name}
                onChange={(changeEvent) => setManagerForm({ ...managerForm, full_name: changeEvent.target.value })}
                required
                className={fieldClass}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Email</span>
              <input
                type="email"
                value={managerForm.email}
                onChange={(changeEvent) => setManagerForm({ ...managerForm, email: changeEvent.target.value })}
                required
                className={fieldClass}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Phone</span>
              <input
                value={managerForm.phone}
                onChange={(changeEvent) => setManagerForm({ ...managerForm, phone: changeEvent.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Password (visible)</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={managerForm.password}
                  onChange={(changeEvent) => setManagerForm({ ...managerForm, password: changeEvent.target.value })}
                  required
                  minLength={6}
                  autoComplete="off"
                  className={`${fieldClass} font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setManagerForm({ ...managerForm, password: generateStadiumManagerPassword() })}
                  className="shrink-0 rounded-lg border border-border px-3 text-sm hover:bg-muted"
                >
                  Generate
                </button>
              </div>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Role</span>
              <select
                value={managerForm.manager_role}
                onChange={(changeEvent) => setManagerForm({ ...managerForm, manager_role: changeEvent.target.value })}
                className={fieldClass}
              >
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
            </label>
          </form>
        )}
      </AdminModal>

      <AdminModal
        open={tierOpen}
        onClose={() => setTierOpen(false)}
        title={editingTierId ? "Edit ticket tier" : "Add ticket tier"}
        footer={
          canWrite ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTierOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="event-tier-form"
                disabled={savingTier}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {savingTier ? "Saving…" : editingTierId ? "Save tier" : "Create tier"}
              </button>
            </div>
          ) : null
        }
      >
        <form id="event-tier-form" onSubmit={(e) => void saveTier(e)} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Name</span>
            <input
              value={tierForm.name}
              onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
              required
              className={fieldClass}
              placeholder="VIP"
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Description</span>
            <input
              value={tierForm.description}
              onChange={(e) => setTierForm({ ...tierForm, description: e.target.value })}
              className={fieldClass}
              placeholder="Priority entry + VIP section"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Price ({event.currency})</span>
            <input
              type="number"
              min={0}
              value={tierForm.price}
              onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Capacity (0 = unlimited)</span>
            <input
              type="number"
              min={0}
              value={tierForm.capacity}
              onChange={(e) => setTierForm({ ...tierForm, capacity: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Max per user</span>
            <input
              type="number"
              min={1}
              value={tierForm.max_per_user}
              onChange={(e) => setTierForm({ ...tierForm, max_per_user: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Sort order</span>
            <input
              type="number"
              value={tierForm.sort_order}
              onChange={(e) => setTierForm({ ...tierForm, sort_order: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Benefits</span>
            <textarea
              value={tierForm.benefits}
              onChange={(e) => setTierForm({ ...tierForm, benefits: e.target.value })}
              rows={2}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={tierForm.is_active}
              onChange={(e) => setTierForm({ ...tierForm, is_active: e.target.checked })}
            />
            Active (shown in app checkout)
          </label>
        </form>
      </AdminModal>
    </>
  );
}
