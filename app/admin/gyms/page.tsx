"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminSearchInput,
  AdminSelect,
  AdminStatCard,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  gymCategories,
  gymCategoryLabel,
  gymFeatureLabel,
  gymStatuses,
  gymVerificationStatuses,
  type GymCategoryRow,
  type GymRow,
} from "@/lib/gyms";
import { adminFetch, patchAdmin, postAdminResponse } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { UserRow } from "@/lib/types";
import { formatDate, formatMoney, locationLabel } from "@/lib/utils";

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const areaClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type OwnerOption = Pick<UserRow, "id" | "display_name" | "email" | "role" | "city">;
type ImageKind = "logo" | "cover";

const emptyForm = {
  name: "",
  category: "gym",
  city: "",
  country: "ET",
  location: "",
  address: "",
  description: "",
  contact_phone: "",
  contact_email: "",
  website: "",
  monthly_payment: "0",
  owner_user_id: "",
  owner_email: "",
  owner_name: "",
  activate: true,
};

type GymDraft = {
  name: string;
  category: string;
  city: string;
  country: string;
  location: string;
  address: string;
  description: string;
  contact_phone: string;
  contact_email: string;
  website: string;
  monthly_payment: string;
  owner_name: string;
  status: string;
  verification_status: string;
};

function draftFromRow(row: GymRow): GymDraft {
  return {
    name: row.name ?? "",
    category: row.category || "gym",
    city: row.city ?? "",
    country: row.country ?? "ET",
    location: row.location ?? "",
    address: row.address ?? "",
    description: row.description ?? "",
    contact_phone: row.contact_phone ?? "",
    contact_email: row.contact_email ?? "",
    website: row.website ?? "",
    monthly_payment: String(row.monthly_payment ?? 0),
    owner_name: row.owner_name ?? "",
    status: row.status || "pending",
    verification_status: row.verification_status || "pending",
  };
}

async function uploadGymImage(gymId: string, file: File, kind: ImageKind) {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  const response = await adminFetch(`/api/admin/gyms/${gymId}/image`, {
    method: "POST",
    body,
  });
  const payload = (await response.json()) as {
    error?: string;
    logo_url?: string;
    cover_url?: string;
    image_url?: string;
  };
  if (!response.ok) throw new Error(payload.error || "Upload failed");
  return payload;
}

async function removeGymImage(gymId: string, kind: ImageKind) {
  const response = await adminFetch(`/api/admin/gyms/${gymId}/image?kind=${kind}`, {
    method: "DELETE",
  });
  const payload = (await response.json()) as {
    error?: string;
    logo_url?: string;
    cover_url?: string;
  };
  if (!response.ok) throw new Error(payload.error || "Remove failed");
  return payload;
}

function validateImageFile(file: File) {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowed.has(file.type)) {
    throw new Error("Use a JPG, PNG, WebP, or GIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
}

function GymImagePicker({
  label,
  previewUrl,
  inputRef,
  disabled,
  uploading,
  onPick,
  onClearLocal,
  onRemoveRemote,
  canRemoveRemote,
}: {
  label: string;
  previewUrl: string;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  uploading?: boolean;
  onPick: (file: File) => void;
  onClearLocal?: () => void;
  onRemoveRemote?: () => void;
  canRemoveRemote?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-text-secondary">
              No {label.toLowerCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-text-primary">{label}</p>
          <p className="text-xs text-text-secondary">JPG, PNG, WebP, or GIF · up to 5 MB</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              disabled={disabled || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPick(file);
              }}
            />
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              {uploading ? "Uploading…" : previewUrl ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
            </button>
            {previewUrl && onClearLocal ? (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={onClearLocal}
                className="text-xs text-text-secondary underline disabled:opacity-60"
              >
                Clear
              </button>
            ) : null}
            {previewUrl && canRemoveRemote && onRemoveRemote ? (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => void onRemoveRemote()}
                className="text-xs text-text-secondary underline disabled:opacity-60"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GymsAdminPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("gyms:write");
  const createLogoRef = useRef<HTMLInputElement>(null);
  const createCoverRef = useRef<HTMLInputElement>(null);
  const editLogoRef = useRef<HTMLInputElement>(null);
  const editCoverRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<GymRow[]>([]);
  const [catalog, setCatalog] = useState<GymCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [verification, setVerification] = useState("all");
  const [category, setCategory] = useState("all");
  const [featuredFilter, setFeaturedFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [createLogoFile, setCreateLogoFile] = useState<File | null>(null);
  const [createCoverFile, setCreateCoverFile] = useState<File | null>(null);
  const [createLogoPreview, setCreateLogoPreview] = useState("");
  const [createCoverPreview, setCreateCoverPreview] = useState("");
  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GymDraft | null>(null);
  const [editingLogo, setEditingLogo] = useState("");
  const [editingCover, setEditingCover] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<ImageKind | null>(null);

  const load = async () => {
    const supabase = getSupabase();
    const [gymsRes, categoriesRes] = await Promise.all([
      supabase
        .from("gyms")
        .select(
          "id, name, slug, logo_url, cover_url, description, location, address, city, country, category, status, verification_status, is_featured, feature_status, feature_requested_at, feature_reviewed_at, rating_avg, follower_count, monthly_payment, contact_phone, contact_email, website, owner_user_id, owner_name, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("gym_categories").select("*").order("sort_order"),
    ]);
    if (gymsRes.error) throw gymsRes.error;
    setRows((gymsRes.data ?? []) as GymRow[]);
    if (!categoriesRes.error && (categoriesRes.data?.length ?? 0) > 0) {
      setCatalog(categoriesRes.data as GymCategoryRow[]);
    } else {
      setCatalog(
        gymCategories.map((item) => ({
          id: item.id,
          slug: item.id,
          label: item.label,
          emoji: item.emoji ?? "",
          sort_order: 0,
        })),
      );
    }
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    const q = ownerQuery.trim().replace(/[%(),]/g, " ");
    if (q.length < 2) {
      setOwnerOptions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setOwnerLoading(true);
      getSupabase()
        .from("users")
        .select("id, display_name, email, role, city")
        .or(`display_name.ilike.%${q}%,email.ilike.%${q}%,full_name.ilike.%${q}%`)
        .order("display_name")
        .limit(12)
        .then(({ data, error: searchError }) => {
          if (cancelled) return;
          if (searchError) {
            setError(searchError.message);
            setOwnerOptions([]);
          } else {
            setOwnerOptions((data ?? []) as OwnerOption[]);
          }
          setOwnerLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [createOpen, ownerQuery]);

  useEffect(() => {
    return () => {
      if (createLogoPreview.startsWith("blob:")) URL.revokeObjectURL(createLogoPreview);
      if (createCoverPreview.startsWith("blob:")) URL.revokeObjectURL(createCoverPreview);
    };
  }, [createLogoPreview, createCoverPreview]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (verification !== "all" && row.verification_status !== verification) {
        return false;
      }
      if (category !== "all" && row.category !== category) return false;
      if (featuredFilter === "featured" && !row.is_featured) return false;
      if (featuredFilter === "pending" && row.feature_status !== "pending") return false;
      if (featuredFilter === "not_featured" && (row.is_featured || row.feature_status === "pending")) {
        return false;
      }
      if (!q) return true;
      return [
        row.name,
        row.city,
        row.location,
        row.address,
        row.contact_email,
        row.category,
        row.owner_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [category, featuredFilter, query, rows, status, verification]);

  const totals = useMemo(() => {
    let active = 0;
    let pending = 0;
    let verified = 0;
    let featurePending = 0;
    let featured = 0;
    for (const row of filtered) {
      if (row.status === "active") active += 1;
      if (row.status === "pending" || row.verification_status === "pending") pending += 1;
      if (row.verification_status === "verified") verified += 1;
      if (row.feature_status === "pending") featurePending += 1;
      if (row.is_featured) featured += 1;
    }
    return { active, pending, verified, featurePending, featured };
  }, [filtered]);

  const selectedOwner = ownerOptions.find((item) => item.id === form.owner_user_id);

  const clearCreateLogo = () => {
    if (createLogoPreview.startsWith("blob:")) URL.revokeObjectURL(createLogoPreview);
    setCreateLogoFile(null);
    setCreateLogoPreview("");
    if (createLogoRef.current) createLogoRef.current.value = "";
  };

  const clearCreateCover = () => {
    if (createCoverPreview.startsWith("blob:")) URL.revokeObjectURL(createCoverPreview);
    setCreateCoverFile(null);
    setCreateCoverPreview("");
    if (createCoverRef.current) createCoverRef.current.value = "";
  };

  const resetCreateForm = () => {
    setForm(emptyForm);
    setOwnerQuery("");
    setOwnerOptions([]);
    clearCreateLogo();
    clearCreateCover();
  };

  const openCreate = () => {
    resetCreateForm();
    setError(null);
    setCreateOpen(true);
  };

  const pickCreateImage = (kind: ImageKind, file: File) => {
    try {
      validateImageFile(file);
      setError(null);
      const url = URL.createObjectURL(file);
      if (kind === "logo") {
        if (createLogoPreview.startsWith("blob:")) URL.revokeObjectURL(createLogoPreview);
        setCreateLogoFile(file);
        setCreateLogoPreview(url);
      } else {
        if (createCoverPreview.startsWith("blob:")) URL.revokeObjectURL(createCoverPreview);
        setCreateCoverFile(file);
        setCreateCoverPreview(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid image");
      if (kind === "logo" && createLogoRef.current) createLogoRef.current.value = "";
      if (kind === "cover" && createCoverRef.current) createCoverRef.current.value = "";
    }
  };

  const create = async () => {
    if (!canWrite) return;
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const ownerEmail = (form.owner_user_id ? "" : form.owner_email || ownerQuery).trim();
      const payload = await postAdminResponse("/api/admin/gyms", {
        name: form.name,
        category: form.category,
        city: form.city,
        country: form.country,
        location: form.location,
        address: form.address,
        description: form.description,
        contact_phone: form.contact_phone,
        contact_email: form.contact_email,
        website: form.website,
        monthly_payment: Number(form.monthly_payment) || 0,
        owner_user_id: form.owner_user_id || undefined,
        owner_email: form.owner_user_id ? undefined : ownerEmail || undefined,
        owner_name: form.owner_name || undefined,
        activate: form.activate,
      });
      const gym = payload.data as GymRow | undefined;
      if (gym?.id) {
        if (createLogoFile) await uploadGymImage(gym.id, createLogoFile, "logo");
        if (createCoverFile) await uploadGymImage(gym.id, createCoverFile, "cover");
      }
      setCreateOpen(false);
      resetCreateForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (row: GymRow) => {
    setEditingId(row.id);
    setDraft(draftFromRow(row));
    setEditingLogo((row.logo_url ?? "").trim());
    setEditingCover((row.cover_url ?? "").trim());
    setEditOpen(true);
    setError(null);
    setUploadingKind(null);
    if (editLogoRef.current) editLogoRef.current.value = "";
    if (editCoverRef.current) editCoverRef.current.value = "";
  };

  const closeEdit = () => {
    if (saving || uploadingKind) return;
    setEditOpen(false);
    setEditingId(null);
    setDraft(null);
    setEditingLogo("");
    setEditingCover("");
    if (editLogoRef.current) editLogoRef.current.value = "";
    if (editCoverRef.current) editCoverRef.current.value = "";
  };

  const applyImageToRows = (id: string, patch: Partial<Pick<GymRow, "logo_url" | "cover_url">>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const uploadEditImage = async (kind: ImageKind, file: File) => {
    if (!editingId || !canWrite) return;
    try {
      validateImageFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid image");
      if (kind === "logo" && editLogoRef.current) editLogoRef.current.value = "";
      if (kind === "cover" && editCoverRef.current) editCoverRef.current.value = "";
      return;
    }
    setUploadingKind(kind);
    setError(null);
    try {
      const payload = await uploadGymImage(editingId, file, kind);
      if (kind === "logo") {
        const next = (payload.logo_url ?? payload.image_url ?? "").trim();
        setEditingLogo(next);
        applyImageToRows(editingId, { logo_url: next });
      } else {
        const next = (payload.cover_url ?? payload.image_url ?? "").trim();
        setEditingCover(next);
        applyImageToRows(editingId, { cover_url: next });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingKind(null);
      if (kind === "logo" && editLogoRef.current) editLogoRef.current.value = "";
      if (kind === "cover" && editCoverRef.current) editCoverRef.current.value = "";
    }
  };

  const removeEditImage = async (kind: ImageKind) => {
    if (!editingId || !canWrite) return;
    setUploadingKind(kind);
    setError(null);
    try {
      await removeGymImage(editingId, kind);
      if (kind === "logo") {
        setEditingLogo("");
        applyImageToRows(editingId, { logo_url: "" });
      } else {
        setEditingCover("");
        applyImageToRows(editingId, { cover_url: "" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploadingKind(null);
    }
  };

  const saveEdit = async () => {
    if (!editingId || !draft || !canWrite) return;
    if (!draft.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/gyms/${editingId}`, {
        name: draft.name.trim(),
        category: draft.category,
        city: draft.city.trim(),
        country: draft.country.trim(),
        location: draft.location.trim(),
        address: draft.address.trim(),
        description: draft.description.trim(),
        contact_phone: draft.contact_phone.trim(),
        contact_email: draft.contact_email.trim(),
        website: draft.website.trim(),
        monthly_payment: Number(draft.monthly_payment) || 0,
        owner_name: draft.owner_name.trim(),
        status: draft.status,
        verification_status: draft.verification_status,
      });
      setEditOpen(false);
      setEditingId(null);
      setDraft(null);
      setEditingLogo("");
      setEditingCover("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const updateGym = async (
    id: string,
    patch: Partial<
      Pick<
        GymRow,
        "status" | "verification_status" | "monthly_payment" | "is_featured" | "feature_status"
      >
    > & { action?: string; approve?: boolean },
  ) => {
    if (!canWrite) return;
    setBusyId(id);
    setError(null);
    try {
      await patchAdmin(`/api/admin/gyms/${id}`, patch);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Gyms"
        description={`${filtered.length} of ${rows.length} · venues, fitness centers, and monthly fees`}
        actions={
          canWrite ? (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Add gym
            </button>
          ) : null
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AdminStatCard title="Shown" value={`${filtered.length}`} />
        <AdminStatCard title="Active" value={`${totals.active}`} />
        <AdminStatCard title="Verified" value={`${totals.verified}`} />
        <AdminStatCard title="Featured" value={`${totals.featured}`} />
        <AdminStatCard title="Feature pending" value={`${totals.featurePending}`} />
      </section>

      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_140px_140px_160px_160px]">
          <AdminSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search name, city, location, owner…"
          />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            {gymStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={verification} onChange={setVerification}>
            <option value="all">All verification</option>
            {gymVerificationStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={category} onChange={setCategory}>
            <option value="all">All categories</option>
            {catalog.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={featuredFilter} onChange={setFeaturedFilter}>
            <option value="all">All featuring</option>
            <option value="featured">Featured</option>
            <option value="pending">Feature pending</option>
            <option value="not_featured">Not featured</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>

      {loading ? <AdminLoadingRow label="Loading gyms…" /> : null}

      <AdminTableShell>
        {!loading && filtered.length === 0 ? (
          <AdminEmpty
            title="No gyms"
            description={
              canWrite
                ? "Add a gym venue, or wait for submissions from the app."
                : "Gym venues from SpoJex appear here."
            }
          />
        ) : !loading ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Gym</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Verification</th>
                  <th className="px-4 py-3 font-semibold">Featured</th>
                  <th className="px-4 py-3 font-semibold">Monthly payment</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const cover = row.cover_url || row.logo_url;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
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
                          <div className="min-w-0">
                            <Link
                              href={`/admin/gyms/${row.id}`}
                              className="font-medium text-text-primary hover:text-primary"
                            >
                              {row.name}
                            </Link>
                            <p className="text-xs text-text-secondary">
                              {locationLabel(row.city, row.location) !== "—"
                                ? [row.city, row.location].filter(Boolean).join(" · ")
                                : locationLabel(row.city, row.country)}
                            </p>
                            <p className="text-xs text-text-hint">
                              ⭐ {(row.rating_avg ?? 0).toFixed(1)} · {row.follower_count ?? 0}{" "}
                              followers
                              {row.owner_name ? ` · ${row.owner_name}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {gymCategoryLabel(row.category, catalog)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={requestTone(row.status)}>{row.status}</StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={requestTone(row.verification_status)}>
                          {row.verification_status.replace(/_/g, " ")}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          tone={
                            row.is_featured
                              ? "success"
                              : row.feature_status === "pending"
                                ? "warning"
                                : row.feature_status === "rejected"
                                  ? "danger"
                                  : "neutral"
                          }
                        >
                          {gymFeatureLabel(row.feature_status, row.is_featured)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoney(row.monthly_payment ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/gyms/${row.id}`}
                            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted"
                          >
                            Manage
                          </Link>
                          {canWrite ? (
                            <>
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                                onClick={() => openEdit(row)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                                onClick={() =>
                                  updateGym(row.id, {
                                    status: "active",
                                    verification_status: "verified",
                                  })
                                }
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                                onClick={() =>
                                  updateGym(row.id, {
                                    verification_status: "under_review",
                                  })
                                }
                              >
                                Review
                              </button>
                              {row.feature_status === "pending" ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={busyId === row.id}
                                    className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                                    onClick={() =>
                                      updateGym(row.id, {
                                        action: "review_featured",
                                        approve: true,
                                      })
                                    }
                                  >
                                    Approve feature
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === row.id}
                                    className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                                    onClick={() =>
                                      updateGym(row.id, {
                                        action: "review_featured",
                                        approve: false,
                                      })
                                    }
                                  >
                                    Reject feature
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busyId === row.id}
                                  className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                                  onClick={() =>
                                    updateGym(row.id, {
                                      is_featured: !row.is_featured,
                                    })
                                  }
                                >
                                  {row.is_featured ? "Unfeature" : "Feature"}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                onClick={() =>
                                  updateGym(row.id, {
                                    status: "inactive",
                                    verification_status: "suspended",
                                  })
                                }
                              >
                                Suspend
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminTableShell>

      <AdminModal
        open={createOpen}
        title="Add gym"
        onClose={() => {
          if (creating) return;
          setCreateOpen(false);
        }}
        className="max-w-2xl"
        footer={
          <AdminModalFooter
            onCancel={() => setCreateOpen(false)}
            onSave={create}
            saving={creating}
            saveLabel="Create gym"
          />
        }
      >
        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-hint">
              Basics
            </h3>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Name</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className={fieldClass}
                placeholder="e.g. Peak Fitness Addis"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Category</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  className={fieldClass}
                >
                  {catalog.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Monthly payment (ETB)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.monthly_payment}
                  onChange={(event) => setForm({ ...form, monthly_payment: event.target.value })}
                  className={fieldClass}
                  placeholder="0"
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Description</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={3}
                className={areaClass}
                placeholder="Facilities, focus areas, hours overview…"
              />
            </label>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-hint">
              Location
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">City</span>
                <input
                  value={form.city}
                  onChange={(event) => setForm({ ...form, city: event.target.value })}
                  className={fieldClass}
                  placeholder="Addis Ababa"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Country</span>
                <input
                  value={form.country}
                  onChange={(event) => setForm({ ...form, country: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Area / neighborhood</span>
                <input
                  value={form.location}
                  onChange={(event) => setForm({ ...form, location: event.target.value })}
                  className={fieldClass}
                  placeholder="Bole, Kazanchis…"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Address</span>
                <input
                  value={form.address}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                  className={fieldClass}
                />
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-hint">
              Owner (optional)
            </h3>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Search SpoJex user</span>
              <input
                value={ownerQuery}
                onChange={(event) => {
                  setOwnerQuery(event.target.value);
                  setForm((prev) => ({
                    ...prev,
                    owner_user_id: "",
                    owner_email: event.target.value,
                  }));
                }}
                className={fieldClass}
                placeholder="Name or email"
              />
              {selectedOwner ? (
                <p className="text-xs text-text-secondary">
                  Selected: {selectedOwner.display_name}
                  {selectedOwner.email ? ` · ${selectedOwner.email}` : ""}
                </p>
              ) : (
                <p className="text-xs text-text-secondary">
                  Optional. Paste an email if they are not listed; they become gym owner staff.
                </p>
              )}
              {ownerLoading ? <p className="text-xs text-text-hint">Searching…</p> : null}
              {ownerOptions.length > 0 ? (
                <ul className="max-h-40 overflow-y-auto rounded-lg border border-border">
                  {ownerOptions.map((owner) => (
                    <li key={owner.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            owner_user_id: owner.id,
                            owner_email: owner.email ?? "",
                            owner_name: owner.display_name || prev.owner_name,
                          }));
                          setOwnerQuery(owner.email || owner.display_name);
                        }}
                        className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted ${
                          form.owner_user_id === owner.id ? "bg-primary/10" : ""
                        }`}
                      >
                        <span className="font-medium">{owner.display_name}</span>
                        <span className="text-xs text-text-secondary">
                          {[owner.email, owner.role, owner.city].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Owner display name</span>
              <input
                value={form.owner_name}
                onChange={(event) => setForm({ ...form, owner_name: event.target.value })}
                className={fieldClass}
                placeholder="Shown on the gym profile"
              />
            </label>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-hint">
              Contact & media
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Phone</span>
                <input
                  value={form.contact_phone}
                  onChange={(event) => setForm({ ...form, contact_phone: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Email</span>
                <input
                  type="email"
                  value={form.contact_email}
                  onChange={(event) => setForm({ ...form, contact_email: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="text-text-secondary">Website</span>
                <input
                  value={form.website}
                  onChange={(event) => setForm({ ...form, website: event.target.value })}
                  className={fieldClass}
                  placeholder="https://"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <GymImagePicker
                label="Logo"
                previewUrl={createLogoPreview}
                inputRef={createLogoRef}
                disabled={creating}
                onPick={(file) => pickCreateImage("logo", file)}
                onClearLocal={clearCreateLogo}
              />
              <GymImagePicker
                label="Cover"
                previewUrl={createCoverPreview}
                inputRef={createCoverRef}
                disabled={creating}
                onPick={(file) => pickCreateImage("cover", file)}
                onClearLocal={clearCreateCover}
              />
            </div>
            {createCoverPreview || createLogoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={createCoverPreview || createLogoPreview}
                alt=""
                className="h-28 w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-sm text-text-secondary">
                Cover preview
              </div>
            )}
          </section>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.activate}
              onChange={(event) => setForm({ ...form, activate: event.target.checked })}
            />
            <span className="text-text-secondary">
              Activate immediately (status active · verification verified)
            </span>
          </label>
        </div>
      </AdminModal>

      <AdminModal
        open={editOpen && !!draft}
        title="Edit gym"
        onClose={closeEdit}
        className="max-w-2xl"
        footer={
          <AdminModalFooter
            onCancel={closeEdit}
            onSave={saveEdit}
            saving={saving || !!uploadingKind}
            saveLabel="Save changes"
          />
        }
      >
        {draft ? (
          <div className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-hint">
                Media
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <GymImagePicker
                  label="Logo"
                  previewUrl={editingLogo}
                  inputRef={editLogoRef}
                  disabled={saving || !canWrite}
                  uploading={uploadingKind === "logo"}
                  onPick={(file) => void uploadEditImage("logo", file)}
                  onRemoveRemote={() => void removeEditImage("logo")}
                  canRemoveRemote
                />
                <GymImagePicker
                  label="Cover"
                  previewUrl={editingCover}
                  inputRef={editCoverRef}
                  disabled={saving || !canWrite}
                  uploading={uploadingKind === "cover"}
                  onPick={(file) => void uploadEditImage("cover", file)}
                  onRemoveRemote={() => void removeEditImage("cover")}
                  canRemoveRemote
                />
              </div>
              {editingCover || editingLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={editingCover || editingLogo}
                  alt=""
                  className="h-28 w-full rounded-xl object-cover"
                />
              ) : null}
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-hint">
                Basics
              </h3>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Name</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Category</span>
                  <select
                    value={draft.category}
                    onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                    className={fieldClass}
                  >
                    {catalog.map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Monthly payment (ETB)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={draft.monthly_payment}
                    onChange={(event) =>
                      setDraft({ ...draft, monthly_payment: event.target.value })
                    }
                    className={fieldClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Status</span>
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                    className={fieldClass}
                  >
                    {gymStatuses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Verification</span>
                  <select
                    value={draft.verification_status}
                    onChange={(event) =>
                      setDraft({ ...draft, verification_status: event.target.value })
                    }
                    className={fieldClass}
                  >
                    {gymVerificationStatuses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Description</span>
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  rows={3}
                  className={areaClass}
                />
              </label>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-hint">
                Location & contact
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">City</span>
                  <input
                    value={draft.city}
                    onChange={(event) => setDraft({ ...draft, city: event.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Country</span>
                  <input
                    value={draft.country}
                    onChange={(event) => setDraft({ ...draft, country: event.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Area / neighborhood</span>
                  <input
                    value={draft.location}
                    onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Address</span>
                  <input
                    value={draft.address}
                    onChange={(event) => setDraft({ ...draft, address: event.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Phone</span>
                  <input
                    value={draft.contact_phone}
                    onChange={(event) => setDraft({ ...draft, contact_phone: event.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Email</span>
                  <input
                    type="email"
                    value={draft.contact_email}
                    onChange={(event) => setDraft({ ...draft, contact_email: event.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-text-secondary">Website</span>
                  <input
                    value={draft.website}
                    onChange={(event) => setDraft({ ...draft, website: event.target.value })}
                    className={fieldClass}
                    placeholder="https://"
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-text-secondary">Owner display name</span>
                  <input
                    value={draft.owner_name}
                    onChange={(event) => setDraft({ ...draft, owner_name: event.target.value })}
                    className={fieldClass}
                  />
                </label>
              </div>
            </section>
          </div>
        ) : null}
      </AdminModal>
    </>
  );
}
