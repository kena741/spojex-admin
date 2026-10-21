"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { clipboardImageFile } from "@/lib/clipboard-image";
import { adminFetch, deleteAdmin, patchAdmin, postAdminResponse } from "@/lib/hooks";
import {
  DELIVERY_MODES,
  PRICING_TYPES,
  PROVIDER_VERIFICATION_NOTE,
  bookingPaymentLabel,
  formatDelivery,
  formatDuration,
  formatPublicationStatus,
  formatRating,
  formatServicePrice,
  publicationTone,
  providerVerificationLabel,
  validateServiceDraft,
} from "@/lib/service-pricing";
import { serviceImageUrls } from "@/lib/services-media";
import type { ServiceCategory, ServiceRequestRow, ServiceRow, ServiceSubcategory } from "@/lib/types";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn, formatDate, formatDateTime, formatMoney, formatStatusLabel, locationLabel } from "@/lib/utils";

const MAX_PHOTOS = 5;
const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const areaClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "bookings", label: "Bookings & Payments" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof tabs)[number]["id"];

type BookingRow = ServiceRequestRow & {
  reference?: string;
  appointment_label?: string;
  payment_label?: string;
  payment_status?: string | null;
  payment_amount?: number;
  payment_currency?: string;
  people_href?: string;
  booking_href?: string;
  finance_href?: string;
  customer_name?: string;
  customer_avatar?: string;
  requester?: { id?: string; display_name?: string; avatar_url?: string } | null;
};

type DetailService = ServiceRow & {
  publication_label?: string;
  delivery_label?: string;
  price_label?: string;
  people_href?: string;
  provider_verification_label?: string;
  provider_verification_note?: string;
  rating_label?: string;
  updated_at?: string;
};

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = can("services:write");
  const fileRef = useRef<HTMLInputElement>(null);

  const tabParam = searchParams.get("tab");
  const tab: TabId =
    tabParam === "bookings" || tabParam === "settings" ? tabParam : "overview";

  const [service, setService] = useState<DetailService | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ServiceSubcategory[]>([]);
  const [metrics, setMetrics] = useState<{ booking_count?: number; payment_count?: number }>({});
  const [definitions, setDefinitions] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [pricingType, setPricingType] = useState("fixed");
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [availability, setAvailability] = useState("in_person");

  const backHref = useMemo(() => {
    try {
      return sessionStorage.getItem("services-return") || "/admin/services";
    } catch {
      return "/admin/services";
    }
  }, []);

  const setTab = (next: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    router.replace(`/admin/services/${id}?${params.toString()}`, { scroll: false });
  };

  const applyService = (next: DetailService) => {
    setService(next);
    setPhotos(serviceImageUrls(next));
    setTitle(next.title);
    setDescription(next.description ?? "");
    setCategoryId(next.category_id);
    setSubcategoryId(next.subcategory_id ?? "");
    setCity(next.city ?? "");
    setCountry(next.country ?? "");
    setPricingType(next.pricing_type || "fixed");
    setAmount(next.price_amount == null ? "" : String(next.price_amount));
    setDuration(next.duration_minutes == null ? "" : String(next.duration_minutes));
    setServiceArea(next.service_area ?? "");
    setAvailability(next.availability_mode || "in_person");
    setDirty(false);
  };

  const load = useCallback(async () => {
    setLoadError(null);
    const response = await fetch(`/api/admin/services/${id}`, { credentials: "same-origin" });
    const payload = (await response.json()) as {
      data?: DetailService;
      categories?: ServiceCategory[];
      subcategories?: ServiceSubcategory[];
      bookings?: BookingRow[];
      metrics?: { booking_count?: number; payment_count?: number };
      definitions?: Record<string, string>;
      error?: string;
    };
    if (response.status === 404) {
      setService(null);
      setLoadError(payload.error || "Service not found");
      return;
    }
    if (!response.ok) throw new Error(payload.error || "Failed to load service");
    setCategories(payload.categories ?? []);
    setSubcategories(payload.subcategories ?? []);
    setBookings(payload.bookings ?? []);
    setMetrics(payload.metrics ?? {});
    setDefinitions(payload.definitions ?? {});
    if (payload.data) applyService(payload.data);
    else {
      setService(null);
      setLoadError("Service not found");
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty && editing) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, editing]);

  const categorySubs = useMemo(
    () => subcategories.filter((item) => item.category_id === categoryId),
    [categoryId, subcategories],
  );

  const photosRef = useRef(photos);
  const uploadingRef = useRef(uploading);
  const serviceRef = useRef(service);
  const photoZoneRef = useRef<HTMLDivElement>(null);
  photosRef.current = photos;
  uploadingRef.current = uploading;
  serviceRef.current = service;

  const markDirty = () => setDirty(true);

  const persistPhotos = async (next: string[]) => {
    const current = serviceRef.current;
    if (!current) return;
    const trimmed = next.map((url) => url.trim()).filter(Boolean).slice(0, MAX_PHOTOS);
    const data = (await patchAdmin(`/api/admin/services/${current.id}`, {
      cover_url: trimmed[0] ?? null,
      images: trimmed,
      expected_updated_at: current.updated_at,
    })) as DetailService | undefined;
    if (data) applyService(data);
    else await load();
  };

  const addPhoto = async (file: File) => {
    if (!serviceRef.current || !editing) return;
    if (photosRef.current.length >= MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos allowed.`);
      return;
    }
    if (uploadingRef.current) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await adminFetch("/api/admin/services/upload", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        image_url?: string;
        publicUrl?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      const url = (payload.image_url || payload.publicUrl || "").trim();
      if (!url) throw new Error("Upload returned no URL");
      await persistPhotos([...photosRef.current, url]);
      setNotice("Photo added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const acceptPhotoFromClipboard = (data: DataTransfer | null) => {
    if (!editing || uploadingRef.current || photosRef.current.length >= MAX_PHOTOS) return false;
    const file = clipboardImageFile(data);
    if (!file) return false;
    void addPhoto(file);
    return true;
  };

  const removePhoto = async (url: string) => {
    if (!editing) return;
    if (!window.confirm("Remove this photo from the listing?")) return;
    setUploading(true);
    setError(null);
    try {
      await persistPhotos(photosRef.current.filter((item) => item !== url));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove photo");
    } finally {
      setUploading(false);
    }
  };

  const setCover = async (url: string) => {
    if (!editing) return;
    const next = [url, ...photosRef.current.filter((p) => p !== url)];
    setUploading(true);
    try {
      await persistPhotos(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set cover");
    } finally {
      setUploading(false);
    }
  };

  const cancelEdit = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    if (service) applyService(service);
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (!service) return;
    const validation = validateServiceDraft({
      title,
      description,
      pricing_type: pricingType,
      price_amount: amount,
      duration_minutes: duration,
      availability_mode: availability,
    });
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = (await patchAdmin(`/api/admin/services/${service.id}`, {
        title: title.trim(),
        description: description.trim(),
        category_id: categoryId,
        subcategory_id: subcategoryId || null,
        city: city.trim(),
        country: country.trim(),
        pricing_type: pricingType,
        price_amount: amount.trim() ? Number(amount) : null,
        duration_minutes: duration.trim() ? Number(duration) : null,
        service_area: serviceArea.trim(),
        availability_mode: availability,
        cover_url: photos[0] ?? null,
        images: photos,
        expected_updated_at: service.updated_at,
      })) as DetailService | undefined;
      if (data) applyService(data);
      else await load();
      setEditing(false);
      setNotice("Listing saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const moderate = async (action: string) => {
    if (!service) return;
    let reason: string | undefined;
    if (["unpublish", "reject", "request_changes"].includes(action)) {
      reason = window.prompt(`Reason for ${action.replace(/_/g, " ")} (required):`) || undefined;
      if (!reason?.trim()) return;
    }
    if (action === "approve") {
      if (
        !window.confirm(
          "Approve and publish this listing immediately? It will become visible in the marketplace.",
        )
      ) {
        return;
      }
    }
    setError(null);
    try {
      await postAdminResponse(`/api/admin/services/${service.id}/moderate`, {
        action,
        reason,
      });
      setNotice(
        action === "approve"
          ? "Approved and published."
          : `Action “${action.replace(/_/g, " ")}” applied.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const archive = async () => {
    if (!service) return;
    if (
      !window.confirm(
        `Archive “${service.title}”? Listings with bookings/payments are unpublished (not hard-deleted).`,
      )
    ) {
      return;
    }
    try {
      const result = await deleteAdmin(`/api/admin/services/${service.id}`);
      if (result?.deleted) {
        router.push(backHref);
        return;
      }
      setNotice(result?.message || "Archived (unpublished).");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    }
  };

  if (loading) return <AdminLoadingRow label="Loading service…" />;

  if (!service) {
    return (
      <>
        <AdminPageHeader title="Service" backHref={backHref} />
        <AdminErrorAlert message={loadError || "Service not found"} />
        <div className="mt-3 flex gap-2">
          <Link
            href={backHref}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to directory
          </Link>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              load()
                .catch((err) =>
                  setLoadError(err instanceof Error ? err.message : "Failed to load"),
                )
                .finally(() => setLoading(false));
            }}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Retry
          </button>
        </div>
      </>
    );
  }

  const categoryLabel = service.category
    ? `${service.category.emoji ?? ""} ${service.category.label}`.trim()
    : categories.find((item) => item.id === service.category_id)?.label || "—";
  const subcategoryLabel = service.subcategory
    ? `${service.subcategory.emoji ?? ""} ${service.subcategory.label}`.trim()
    : subcategories.find((item) => item.id === service.subcategory_id)?.label || "—";

  const deliveryOptions: Array<{ id: string; label: string }> = [...DELIVERY_MODES];
  if (availability && !DELIVERY_MODES.some((m) => m.id === availability)) {
    deliveryOptions.push({
      id: availability,
      label: `${formatDelivery(availability)} (legacy — preserved)`,
    });
  }

  return (
    <>
      <AdminPageHeader
        title={service.title}
        backHref={backHref}
        stackOnSmall
        breadcrumbs={[
          { label: "Services", href: backHref },
          { label: service.title },
        ]}
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              {!service.published ? (
                <button
                  type="button"
                  onClick={() => void moderate("approve")}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Approve & publish
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void moderate("unpublish")}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Unpublish
                </button>
              )}
              <button
                type="button"
                onClick={() => void moderate(service.is_featured ? "unfeature" : "feature")}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                {service.is_featured ? "Unfeature" : "Feature"}
              </button>
              <button
                type="button"
                onClick={() => void archive()}
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Archive
              </button>
            </div>
          ) : null
        }
      />

      {notice ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      {definitions.publication ? (
        <p className="mb-3 text-xs text-text-hint">{definitions.publication}</p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (editing && dirty && t.id !== "settings") {
                if (!window.confirm("Leave Settings with unsaved changes?")) return;
                cancelEdit();
              }
              setTab(t.id);
            }}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {t.label}
            {t.id === "bookings" && bookings.length
              ? ` (${bookings.length})`
              : ""}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-heading text-sm font-semibold">Listing preview</h2>
              <StatusBadge tone={requestTone(publicationTone(service.published))}>
                {service.publication_label || formatPublicationStatus(service.published)}
              </StatusBadge>
            </div>
            {photos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photos[0]}
                alt=""
                className="mb-3 aspect-[4/3] w-full max-w-md rounded-lg object-cover bg-muted"
              />
            ) : (
              <div className="mb-3 grid aspect-[4/3] max-w-md place-items-center rounded-lg bg-muted text-sm text-text-hint">
                No cover photo
              </div>
            )}
            {photos.length > 1 ? (
              <div className="mb-4 flex gap-2 overflow-x-auto">
                {photos.slice(1).map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className="h-16 w-20 shrink-0 rounded object-cover"
                  />
                ))}
              </div>
            ) : null}
            <h3 className="text-lg font-semibold text-text-primary">{service.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
              {service.description || "No description."}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <Item label="Category" value={categoryLabel} />
              <Item label="Subcategory" value={subcategoryLabel} />
              <Item label="Location" value={locationLabel(service.city, service.country)} />
              <Item label="Service area" value={service.service_area || "—"} />
              <Item
                label="Delivery"
                value={service.delivery_label || formatDelivery(service.availability_mode)}
              />
              <Item
                label="Pricing"
                value={service.price_label || formatServicePrice(service)}
              />
              <Item
                label="Duration"
                value={formatDuration(service.duration_minutes) || "—"}
              />
              <Item
                label="Rating"
                value={
                  service.rating_label ||
                  formatRating(service.rating_avg, service.review_count)
                }
              />
              <Item label="Created" value={formatDate(service.created_at)} />
            </dl>
          </section>

          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-3 font-heading text-sm font-semibold">Provider</h2>
              {service.users ? (
                <div className="flex items-start gap-3">
                  {service.users.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={service.users.avatar_url}
                      alt=""
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary">
                      {(service.users.display_name || "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <Link
                      href={service.people_href || `/admin/people/${service.users.id}`}
                      className="font-medium text-primary"
                    >
                      {service.users.display_name}
                    </Link>
                    {service.users.role ? (
                      <p className="text-sm capitalize text-text-secondary">
                        {formatStatusLabel(service.users.role)}
                      </p>
                    ) : null}
                    <p
                      className="mt-1 text-xs text-text-hint"
                      title={service.provider_verification_note || PROVIDER_VERIFICATION_NOTE}
                    >
                      {service.provider_verification_label ||
                        providerVerificationLabel(service.users.verified)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm">{service.provider_id}</p>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-3 font-heading text-sm font-semibold">Performance</h2>
              <dl className="space-y-2 text-sm">
                <Item label="Bookings" value={String(metrics.booking_count ?? bookings.length)} />
                <Item label="Payments" value={String(metrics.payment_count ?? "—")} />
                <Item
                  label="Featured"
                  value={service.is_featured ? "Yes" : "No"}
                />
                {service.feature_requested_status ? (
                  <Item
                    label="Feature request"
                    value={formatStatusLabel(service.feature_requested_status)}
                  />
                ) : null}
              </dl>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "bookings" ? (
        <AdminTableShell>
          {bookings.length === 0 ? (
            <AdminEmpty
              title="No bookings"
              description="Bookings for this listing appear here with payment status from verified payment records."
            />
          ) : (
            <ul className="divide-y divide-border">
              {bookings.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {row.requester?.avatar_url || row.customer_avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.requester?.avatar_url || row.customer_avatar || ""}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
                        {(
                          row.requester?.display_name ||
                          row.customer_name ||
                          "?"
                        )
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <Link
                        href={row.people_href || `/admin/people/${row.requester_id}`}
                        className="font-medium text-primary"
                      >
                        {row.requester?.display_name ||
                          row.customer_name ||
                          "Customer"}
                      </Link>
                      <p className="text-xs text-text-secondary">
                        {row.reference || `BK-${row.id.slice(0, 8).toUpperCase()}`}
                      </p>
                      <p className="text-xs text-text-hint">
                        Appointment: {row.appointment_label || "Not scheduled"}
                      </p>
                      <p className="text-xs text-text-hint">
                        Created: {formatDateTime(row.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <div className="text-sm text-text-secondary">
                      <p>
                        {row.payment_label ||
                          bookingPaymentLabel(
                            row.payment_status || null,
                            service.pricing_type,
                          )}
                      </p>
                      {row.payment_amount != null ? (
                        <p className="text-xs">
                          {formatMoney(row.payment_amount, row.payment_currency || "ETB")}
                        </p>
                      ) : null}
                      {row.finance_href ? (
                        <Link href={row.finance_href} className="text-xs text-primary">
                          Finance tx
                        </Link>
                      ) : null}
                    </div>
                    <StatusBadge tone={requestTone(row.status)}>
                      {formatStatusLabel(row.status)}
                    </StatusBadge>
                    <Link
                      href={row.booking_href || `/admin/requests?q=${row.id}`}
                      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                    >
                      Open booking
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminTableShell>
      ) : null}

      {tab === "settings" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-sm font-semibold">Listing settings</h2>
            {canWrite ? (
              editing ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving || uploading}
                    onClick={cancelEdit}
                    className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving || uploading || !dirty}
                    onClick={() => void save()}
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Edit
                </button>
              )
            ) : null}
          </div>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">Media · 4:3 · {photos.length}/{MAX_PHOTOS}</h3>
            {editing ? (
              <div
                ref={photoZoneRef}
                tabIndex={0}
                role="button"
                aria-label="Paste or drop service photo"
                onPaste={(pasteEvent) => {
                  if (acceptPhotoFromClipboard(pasteEvent.clipboardData)) {
                    pasteEvent.preventDefault();
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (!uploading && photos.length < MAX_PHOTOS) setPhotoDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!uploading && photos.length < MAX_PHOTOS) setPhotoDragOver(true);
                }}
                onDragLeave={() => setPhotoDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setPhotoDragOver(false);
                  acceptPhotoFromClipboard(e.dataTransfer);
                }}
                className={cn(
                  "rounded-lg border border-dashed outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  photoDragOver ? "border-primary bg-primary/10" : "border-border bg-muted/30",
                )}
              >
                <div className="mb-2 flex justify-end p-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void addPhoto(file);
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading || photos.length >= MAX_PHOTOS}
                    onClick={() => fileRef.current?.click()}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {uploading ? "Uploading…" : "Add photo"}
                  </button>
                </div>
                {photos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
                    {photos.map((src, index) => (
                      <div
                        key={`${src}-${index}`}
                        className="group relative overflow-hidden rounded-lg border border-border bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="aspect-[4/3] w-full object-contain" />
                        {index === 0 ? (
                          <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            Cover
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={uploading}
                            onClick={() => void setCover(src)}
                            className="absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-[11px] font-medium text-white"
                          >
                            Set cover
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => void removePhoto(src)}
                          className="absolute right-2 top-2 rounded bg-black/65 px-2 py-1 text-[11px] font-medium text-white"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] max-w-sm flex-col items-center justify-center gap-1 px-3 text-center text-sm text-text-secondary">
                    Paste or drop an image · JPG, PNG, WebP, GIF
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {photos.length ? (
                  photos.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={src}
                      src={src}
                      alt=""
                      className="aspect-[4/3] w-28 rounded object-cover"
                      title={i === 0 ? "Cover" : undefined}
                    />
                  ))
                ) : (
                  <p className="text-sm text-text-secondary">No photos</p>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">Basic information</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Service name">
                <input
                  value={title}
                  disabled={!editing}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    markDirty();
                  }}
                  className={fieldClass}
                />
              </Field>
              <Field label="City">
                <input
                  value={city}
                  disabled={!editing}
                  onChange={(e) => {
                    setCity(e.target.value);
                    markDirty();
                  }}
                  className={fieldClass}
                />
              </Field>
              <Field label="Country">
                <input
                  value={country}
                  disabled={!editing}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    markDirty();
                  }}
                  className={fieldClass}
                />
              </Field>
              <Field label="Service area">
                <input
                  value={serviceArea}
                  disabled={!editing}
                  onChange={(e) => {
                    setServiceArea(e.target.value);
                    markDirty();
                  }}
                  className={fieldClass}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Description">
                  <textarea
                    value={description}
                    disabled={!editing}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      markDirty();
                    }}
                    rows={4}
                    className={areaClass}
                  />
                </Field>
              </div>
              <Field label="Category">
                <select
                  value={categoryId}
                  disabled={!editing}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setSubcategoryId("");
                    markDirty();
                  }}
                  className={fieldClass}
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.emoji} {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subcategory">
                <select
                  value={subcategoryId}
                  disabled={!editing}
                  onChange={(e) => {
                    setSubcategoryId(e.target.value);
                    markDirty();
                  }}
                  className={fieldClass}
                >
                  <option value="">None</option>
                  {categorySubs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.emoji} {item.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">Pricing & delivery</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Pricing type">
                <select
                  value={pricingType}
                  disabled={!editing}
                  onChange={(e) => {
                    setPricingType(e.target.value);
                    markDirty();
                  }}
                  className={fieldClass}
                >
                  {PRICING_TYPES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Amount (leave empty for free/quote)">
                <input
                  value={amount}
                  disabled={!editing || pricingType === "free" || pricingType === "custom_quote"}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    markDirty();
                  }}
                  className={fieldClass}
                />
              </Field>
              <Field label="Duration (minutes)">
                <input
                  value={duration}
                  disabled={!editing}
                  onChange={(e) => {
                    setDuration(e.target.value);
                    markDirty();
                  }}
                  className={fieldClass}
                />
              </Field>
              <Field label="Delivery">
                <select
                  value={availability}
                  disabled={!editing}
                  onChange={(e) => {
                    setAvailability(e.target.value);
                    markDirty();
                  }}
                  className={fieldClass}
                >
                  {deliveryOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {availability === "on_request" ? (
              <p className="mt-2 text-xs text-amber-700">
                Legacy delivery value “on_request” is preserved. It is not remapped to In person,
                Online, or Custom quote until an explicit migration.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
