"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { deleteAdmin, patchAdmin } from "@/lib/hooks";
import { firstPayment } from "@/lib/marketplace";
import { serviceImageUrls } from "@/lib/services-media";
import type { ServiceCategory, ServiceRequestRow, ServiceRow, ServiceSubcategory } from "@/lib/types";
import { formatDate, formatMoney, formatStatusLabel, locationLabel } from "@/lib/utils";

const pricingTypes = ["fixed", "starting", "hourly", "per_session", "per_day", "custom_quote", "free"];
const availabilityModes = [
  { id: "in_person", label: "In person" },
  { id: "online", label: "Online" },
  { id: "both", label: "Online and in person" },
];

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [service, setService] = useState<ServiceRow | null>(null);
  const [bookings, setBookings] = useState<ServiceRequestRow[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ServiceSubcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [city, setCity] = useState("");
  const [pricingType, setPricingType] = useState("fixed");
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [availability, setAvailability] = useState("in_person");

  const load = async () => {
    const response = await fetch(`/api/admin/services/${id}`, { credentials: "same-origin" });
    const payload = (await response.json()) as {
      data?: ServiceRow;
      categories?: ServiceCategory[];
      subcategories?: ServiceSubcategory[];
      bookings?: ServiceRequestRow[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load service");
    const next = payload.data ?? null;
    setService(next);
    setCategories(payload.categories ?? []);
    setSubcategories(payload.subcategories ?? []);
    setBookings(payload.bookings ?? []);
    if (next) {
      setTitle(next.title);
      setDescription(next.description ?? "");
      setCategoryId(next.category_id);
      setSubcategoryId(next.subcategory_id ?? "");
      setCity(next.city ?? "");
      setPricingType(next.pricing_type || "fixed");
      setAmount(next.price_amount == null ? "" : String(next.price_amount));
      setDuration(next.duration_minutes == null ? "" : String(next.duration_minutes));
      setServiceArea(next.service_area ?? "");
      setAvailability(next.availability_mode || "in_person");
    }
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const categorySubs = useMemo(
    () => subcategories.filter((item) => item.category_id === categoryId),
    [categoryId, subcategories],
  );

  const togglePublished = async () => {
    if (!service) return;
    try {
      await patchAdmin(`/api/admin/services/${service.id}`, { published: !service.published });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const toggleFeatured = async () => {
    if (!service) return;
    try {
      await patchAdmin(`/api/admin/services/${service.id}`, {
        is_featured: !service.is_featured,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const save = async () => {
    if (!service) return;
    setSaving(true);
    try {
      await patchAdmin(`/api/admin/services/${service.id}`, {
        title: title.trim(),
        description: description.trim(),
        category_id: categoryId,
        subcategory_id: subcategoryId || null,
        city: city.trim(),
        pricing_type: pricingType,
        price_amount: amount.trim() ? Number(amount) : null,
        duration_minutes: duration.trim() ? Number(duration) : null,
        service_area: serviceArea.trim(),
        availability_mode: availability,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!service) return;
    if (!window.confirm(`Delete “${service.title}”? This cannot be undone.`)) return;
    try {
      await deleteAdmin(`/api/admin/services/${service.id}`);
      router.push("/admin/services");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (loading) return <AdminLoadingRow label="Loading service…" />;
  if (!service) return <AdminErrorAlert message={error || "Service not found"} />;

  const photos = serviceImageUrls(service);
  const categoryLabel = service.category
    ? `${service.category.emoji ?? ""} ${service.category.label}`.trim()
    : categories.find((item) => item.id === service.category_id)?.label || service.category_id;
  const subcategoryLabel = service.subcategory
    ? `${service.subcategory.emoji ?? ""} ${service.subcategory.label}`.trim()
    : subcategories.find((item) => item.id === service.subcategory_id)?.label || "—";

  return (
    <>
      <AdminPageHeader
        title={service.title}
        backHref="/admin/services"
        stackOnSmall
        breadcrumbs={[
          { label: "Services", href: "/admin/services" },
          { label: service.title },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={togglePublished}
              className={
                service.published
                  ? "rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                  : "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              }
            >
              {service.published ? "Unpublish" : "Approve listing"}
            </button>
            <button
              type="button"
              onClick={toggleFeatured}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {service.is_featured ? "Unfeature" : "Feature on home"}
            </button>
            <button
              type="button"
              onClick={remove}
              className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold">Listing</h2>
            <StatusBadge tone={requestTone(service.published ? "approved" : "pending")}>
              {service.published ? "Approved" : "Pending approval"}
            </StatusBadge>
          </div>
          {photos.length > 0 ? (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" className="h-24 w-full rounded-lg object-cover" />
              ))}
            </div>
          ) : null}
          <p className="text-sm text-text-secondary">{service.description || "No description."}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <Item label="Category" value={categoryLabel} />
            <Item label="Subcategory" value={subcategoryLabel} />
            <Item label="Location" value={locationLabel(service.city, service.country)} />
            <Item label="Service area" value={service.service_area || "—"} />
            <Item label="Pricing" value={formatStatusLabel(service.pricing_type)} />
            <Item
              label="Amount"
              value={service.price_amount == null ? "—" : `${service.price_amount} ${service.currency}`}
            />
            <Item label="Duration" value={service.duration_minutes ? `${service.duration_minutes} min` : "—"} />
            <Item label="Availability" value={formatStatusLabel(service.availability_mode)} />
            <Item
              label="Rating"
              value={
                service.review_count > 0
                  ? `${service.rating_avg} (${service.review_count})`
                  : "Not rated"
              }
            />
            <Item label="Created" value={formatDate(service.created_at)} />
          </dl>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-heading text-sm font-semibold">Provider</h2>
          {service.users ? (
            <>
              <Link href={`/admin/users/${service.users.id}`} className="font-medium text-primary">
                {service.users.display_name}
              </Link>
              {service.users.role ? (
                <p className="mt-1 text-sm capitalize text-text-secondary">{service.users.role}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm">{service.provider_id}</p>
          )}
          <h2 className="mb-3 mt-6 font-heading text-sm font-semibold">Edit listing</h2>
          <div className="grid gap-3">
            <Field label="Service name">
              <input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Description">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </Field>
            <Field label="Category">
              <select
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  setSubcategoryId("");
                }}
                className={inputClass}
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
                onChange={(event) => setSubcategoryId(event.target.value)}
                className={inputClass}
              >
                <option value="">None</option>
                {categorySubs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.emoji} {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <input value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Service area">
              <input value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Pricing type">
              <select
                value={pricingType}
                onChange={(event) => setPricingType(event.target.value)}
                className={inputClass}
              >
                {pricingTypes.map((item) => (
                  <option key={item} value={item}>
                    {formatStatusLabel(item)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount">
              <input value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Duration (minutes)">
              <input value={duration} onChange={(event) => setDuration(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Delivery">
              <select
                value={availability}
                onChange={(event) => setAvailability(event.target.value)}
                className={inputClass}
              >
                {availabilityModes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </section>
      </div>
      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-heading text-sm font-semibold">Bookings ({bookings.length})</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-text-secondary">No bookings for this listing yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-text-secondary">
                <tr>
                  <th className="whitespace-nowrap py-2 font-semibold">Customer</th>
                  <th className="whitespace-nowrap py-2 font-semibold">When</th>
                  <th className="whitespace-nowrap py-2 font-semibold">Payment</th>
                  <th className="whitespace-nowrap py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((row) => {
                  const payment = firstPayment(row.service_payments);
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="py-2">
                        <Link href={`/admin/users/${row.requester_id}`} className="text-primary">
                          {row.requester?.display_name || row.requester_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-2 text-text-secondary">
                        {formatDate(row.requested_at || row.requested_on || row.created_at)}
                      </td>
                      <td className="py-2 text-text-secondary">
                        {payment
                          ? `${formatMoney(payment.amount, payment.currency)} · ${formatStatusLabel(payment.status)}`
                          : "—"}
                      </td>
                      <td className="py-2">
                        <StatusBadge tone={requestTone(row.status)}>{formatStatusLabel(row.status)}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

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
