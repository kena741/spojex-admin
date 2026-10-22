"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MapPin,
  Star,
  Users,
  Search,
  Plus,
  Pencil,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Sparkles,
} from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
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
import { gymAllowedActions, gymActionPatch, type GymActionId } from "@/lib/gym-actions";
import {
  gymCategories,
  gymCategoryLabel,
  gymFeatureLabel,
  gymPlatformFeeLabel,
  gymRatingLabel,
  gymStatuses,
  gymVerificationStatuses,
  type GymCategoryRow,
  type GymRow,
} from "@/lib/gyms";
import { adminFetch, patchAdmin, postAdminResponse } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { UserRow } from "@/lib/types";
import { formatDate, locationLabel } from "@/lib/utils";

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
  owner_user_id: string;
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
    owner_user_id: row.owner_user_id ?? "",
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

/* ─── Gym Card (Mobile) ─── */

function GymCard({
  row,
  catalog,
  canWrite,
  busyId,
  onEdit,
  onAction,
}: {
  row: GymRow;
  catalog: GymCategoryRow[];
  canWrite: boolean;
  busyId: string | null;
  onEdit: () => void;
  onAction: (id: GymActionId, needsReason?: boolean) => void;
}) {
  const cover = row.cover_url || row.logo_url;
  const isBusy = busyId === row.id;

  return (
    <Link
      href={`/admin/gyms/${row.id}`}
      className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      {/* Header */}
      <div className="mb-3 flex items-start gap-3">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] text-text-secondary">
            No img
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-primary break-words">{row.name}</p>
          <p className="flex items-center gap-1 text-xs text-text-secondary">
            <MapPin className="h-3 w-3" />
            {locationLabel(row.city, row.country)}
            {row.location?.trim() ? ` · ${row.location.trim()}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-hint">
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              {gymRatingLabel(row.rating_avg, row.rating_count)}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {row.follower_count ?? 0}
            </span>
            {row.owner_name ? <span>· {row.owner_name}</span> : null}
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <StatusBadge tone={requestTone(row.status)}>{row.status}</StatusBadge>
        <StatusBadge tone={requestTone(row.verification_status)}>
          {row.verification_status.replace(/_/g, " ")}
        </StatusBadge>
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
      </div>

      {/* Meta */}
      <div className="mb-3 flex items-center justify-between text-xs text-text-secondary">
        <span>{gymCategoryLabel(row.category, catalog)}</span>
        <span
          className="tabular-nums font-medium text-text-primary"
          title="Monthly platform fee paid by the gym to Spojex (not member prices)"
        >
          {gymPlatformFeeLabel(row.monthly_payment)}
        </span>
      </div>

      {canWrite ? (
        <div
          className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <GymActionsMenu row={row} busy={isBusy} onEdit={onEdit} onAction={onAction} />
        </div>
      ) : null}
    </Link>
  );
}

function GymActionsMenu({
  row,
  busy,
  onEdit,
  onAction,
}: {
  row: GymRow;
  busy: boolean;
  onEdit: () => void;
  onAction: (id: GymActionId, needsReason?: boolean) => void;
}) {
  const actions = gymAllowedActions(row);
  const items: AdminRowMenuItem[] = actions.map((action, index) => ({
    id: action.id,
    label: action.label,
    tone:
      action.tone === "danger"
        ? "danger"
        : action.tone === "success"
          ? "success"
          : "default",
    separatorBefore: action.tone === "danger" && index > 0,
    onClick: () => {
      if (action.id === "edit") return onEdit();
      onAction(action.id, action.needsReason);
    },
  }));
  return (
    <AdminRowMenu items={items} disabled={busy} aria-label={`Actions for ${row.name || "gym"}`} />
  );
}

/* ─── Main Page ─── */

export default function GymsAdminPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("gyms:write");
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const createLogoRef = useRef<HTMLInputElement>(null);
  const createCoverRef = useRef<HTMLInputElement>(null);
  const editLogoRef = useRef<HTMLInputElement>(null);
  const editCoverRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<GymRow[]>([]);
  const [catalog, setCatalog] = useState<GymCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [verification, setVerification] = useState(
    searchParams.get("verification") || "all",
  );
  const [category, setCategory] = useState(searchParams.get("category") || "all");
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get("location") || "",
  );
  const [featuredFilter, setFeaturedFilter] = useState(
    searchParams.get("featured") || "all",
  );
  const [page, setPage] = useState(Number(searchParams.get("page") || "1") || 1);
  const [pageSize] = useState(40);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sort] = useState("created_at");
  const [order] = useState("desc");

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

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status !== "all") params.set("status", status);
    if (verification !== "all") params.set("verification", verification);
    if (category !== "all") params.set("category", category);
    if (locationFilter.trim()) params.set("location", locationFilter.trim());
    if (featuredFilter !== "all") params.set("featured", featuredFilter);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    params.set("sort", sort);
    params.set("order", order);

    const [gymsRes, categoriesRes] = await Promise.all([
      fetch(`/api/admin/gyms?${params}`, { credentials: "same-origin", cache: "no-store" }),
      getSpojexClient().from("gym_categories").select("*").order("sort_order"),
    ]);
    const payload = (await gymsRes.json().catch(() => ({}))) as {
      data?: GymRow[];
      total?: number;
      error?: string;
    };
    if (!gymsRes.ok) throw new Error(payload.error || "Failed to load gyms");
    setRows((payload.data ?? []) as GymRow[]);
    setTotal(Number(payload.total ?? 0));
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
  }, [query, status, verification, category, locationFilter, featuredFilter, page, pageSize, sort, order]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [load]);

  // Fetch once on mount and when page changes. Filters apply on Reload.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Apply URL filters on browser back/forward and deep links (e.g. verification=queue).
  useEffect(() => {
    setQuery(searchParams.get("q") || "");
    setStatus(searchParams.get("status") || "all");
    setVerification(searchParams.get("verification") || "all");
    setCategory(searchParams.get("category") || "all");
    setLocationFilter(searchParams.get("location") || "");
    setFeaturedFilter(searchParams.get("featured") || "all");
    setPage(Number(searchParams.get("page") || "1") || 1);
  }, [searchParams]);

  useEffect(() => {
    if (!createOpen && !editOpen) return;
    const q = ownerQuery.trim().replace(/[%(),]/g, " ");
    if (q.length < 2) {
      setOwnerOptions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setOwnerLoading(true);
      void adminFetch(`/api/admin/users?q=${encodeURIComponent(q)}&limit=12`)
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as {
            data?: OwnerOption[];
            error?: string;
          };
          if (cancelled) return;
          if (!res.ok) {
            setError(json.error || "Failed to search users");
            setOwnerOptions([]);
          } else {
            setOwnerOptions(json.data ?? []);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to search users");
          setOwnerOptions([]);
        })
        .finally(() => {
          if (!cancelled) setOwnerLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [createOpen, editOpen, ownerQuery]);

  useEffect(() => {
    return () => {
      if (createLogoPreview.startsWith("blob:")) URL.revokeObjectURL(createLogoPreview);
      if (createCoverPreview.startsWith("blob:")) URL.revokeObjectURL(createCoverPreview);
    };
  }, [createLogoPreview, createCoverPreview]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (status !== "all") next.set("status", status);
    if (verification !== "all") next.set("verification", verification);
    if (category !== "all") next.set("category", category);
    if (locationFilter.trim()) next.set("location", locationFilter.trim());
    if (featuredFilter !== "all") next.set("featured", featuredFilter);
    if (page > 1) next.set("page", String(page));
    const qs = next.toString();
    const current = searchParams.toString();
    if (qs !== current) {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync outward only when filters change
  }, [query, status, verification, category, locationFilter, featuredFilter, page]);

  // Server already filtered/paginated.
  const filtered = rows;

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

  const runGymAction = async (id: string, actionId: GymActionId, needsReason?: boolean) => {
    if (!canWrite || actionId === "edit") return;
    let reason: string | undefined;
    if (needsReason) {
      const prompted = window.prompt("Reason (required):");
      if (!prompted?.trim()) return;
      reason = prompted.trim();
    }
    const patch = gymActionPatch(actionId);
    if (!patch) return;
    setBusyId(id);
    setError(null);
    try {
      await patchAdmin(`/api/admin/gyms/${id}`, {
        ...patch,
        ...(reason ? { reason } : {}),
        idempotency_key: `${id}:${actionId}:${Date.now()}`,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const selectedOwner = ownerOptions.find((item) => item.id === form.owner_user_id);
  const selectedEditOwner = ownerOptions.find(
    (item) => item.id === (draft?.owner_user_id ?? ""),
  );

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
    if (!form.owner_user_id.trim()) {
      setError("Select an existing SpoJex user as the gym owner.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
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
        owner_user_id: form.owner_user_id,
        activate: form.activate,
      });
      const gym = payload.data as GymRow | undefined;
      if (gym?.id) {
        if (createLogoFile) await uploadGymImage(gym.id, createLogoFile, "logo");
        if (createCoverFile) await uploadGymImage(gym.id, createCoverFile, "cover");
      }
      setCreateOpen(false);
      resetCreateForm();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (row: GymRow) => {
    setEditingId(row.id);
    setDraft(draftFromRow(row));
    setOwnerQuery((row.owner_name || row.owner_user_id || "").trim());
    setOwnerOptions([]);
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
    setOwnerQuery("");
    setOwnerOptions([]);
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
    if (!draft.owner_user_id.trim()) {
      setError("Select an existing SpoJex user as the gym owner.");
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
        owner_user_id: draft.owner_user_id.trim(),
        status: draft.status,
        verification_status: draft.verification_status,
      });
      setEditOpen(false);
      setEditingId(null);
      setDraft(null);
      setOwnerQuery("");
      setOwnerOptions([]);
      setEditingLogo("");
      setEditingCover("");
      await refresh();
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
    > & { action?: string; approve?: boolean; reason?: string; idempotency_key?: string },
  ) => {
    if (!canWrite) return;
    setBusyId(id);
    setError(null);
    try {
      await patchAdmin(`/api/admin/gyms/${id}`, patch);
      await refresh();
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
        description={`${filtered.length} of ${rows.length} · venues and fitness centers`}
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton loading={loading} onClick={() => void refresh()} />
            <Link
              href="/admin/gyms/settings"
              className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-text-secondary hover:text-foreground"
            >
              Settings
            </Link>
            {canWrite ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add gym</span>
                <span className="sm:hidden">Add</span>
              </button>
            ) : null}
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      {/* Stat Cards */}
      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <AdminStatCard title="Total" value={`${total}`} />
        <AdminStatCard title="Active (page)" value={`${totals.active}`} />
        <AdminStatCard title="Verified (page)" value={`${totals.verified}`} />
        <AdminStatCard title="Featured (page)" value={`${totals.featured}`} />
        <AdminStatCard title="Feature pending" value={`${totals.featurePending}`} />
      </section>

      {/* Filters */}
      <AdminFilterPanel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <AdminSearchInput
            value={query}
            onChange={(value) => {
              setPage(1);
              setQuery(value);
            }}
            placeholder="Search name, city, location, owner…"
          />
          <AdminSelect
            value={status}
            onChange={(value) => {
              setPage(1);
              setStatus(value);
            }}
          >
            <option value="all">All listing statuses</option>
            {gymStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={verification}
            onChange={(value) => {
              setPage(1);
              setVerification(value);
            }}
          >
            <option value="all">All verification</option>
            <option value="queue">Verification queue (pending + under review)</option>
            {gymVerificationStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={category}
            onChange={(value) => {
              setPage(1);
              setCategory(value);
            }}
          >
            <option value="all">All categories</option>
            {catalog.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSearchInput
            value={locationFilter}
            onChange={(value) => {
              setPage(1);
              setLocationFilter(value);
            }}
            placeholder="Location (city / area)"
          />
          <AdminSelect
            value={featuredFilter}
            onChange={(value) => {
              setPage(1);
              setFeaturedFilter(value);
            }}
          >
            <option value="all">All featuring</option>
            <option value="featured">Featured</option>
            <option value="pending">Feature pending</option>
            <option value="not_featured">Not featured</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>

      {/* Mobile Card Layout */}
      {loading ? (
        <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:hidden">
          <AdminLoadingRow label="Loading gyms…" compact className="py-10" />
        </div>
      ) : null}
      {!loading && filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:hidden">
          {filtered.map((row) => (
            <GymCard
              key={row.id}
              row={row}
              catalog={catalog}
              canWrite={canWrite}
              busyId={busyId}
              onEdit={() => openEdit(row)}
              onAction={(actionId, needsReason) =>
                void runGymAction(row.id, actionId, needsReason)
              }
            />
          ))}
        </div>
      ) : null}

      {/* Desktop Table Layout */}
      <div className="hidden lg:block">
      <AdminTableShell>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="min-w-[14rem] px-4 py-3 font-semibold">Gym</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                  <th className="px-4 py-3 font-semibold">Listing</th>
                  <th className="px-4 py-3 font-semibold">Verification</th>
                  <th className="px-4 py-3 font-semibold">Featured</th>
                  <th className="px-4 py-3 font-semibold" title="Monthly Gym→Spojex platform fee">
                    Monthly platform fee
                  </th>
                  <th className="px-4 py-3 font-semibold">Memberships</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <AdminTableLoading colSpan={canWrite ? 10 : 9} label="Loading gyms…" />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 10 : 9} className="p-0">
                      <AdminEmpty
                        title="No gyms"
                        description={
                          canWrite
                            ? "Add a gym venue, or wait for submissions from the app. Adjust filters and Reload."
                            : "Gym venues from SpoJex appear here."
                        }
                      />
                    </td>
                  </tr>
                ) : filtered.map((row) => {
                  const cover = row.cover_url || row.logo_url;
                  return (
                    <tr
                      key={row.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/admin/gyms/${row.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/admin/gyms/${row.id}`);
                        }
                      }}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                    >
                      <td className="min-w-[14rem] px-4 py-3">
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
                          <div className="min-w-[10rem]">
                            <p className="whitespace-nowrap font-medium text-text-primary">
                              {row.name}
                            </p>
                            <p className="text-xs text-text-hint">
                              {gymRatingLabel(row.rating_avg, row.rating_count)} ·{" "}
                              {row.follower_count ?? 0} followers
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {gymCategoryLabel(row.category, catalog)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {locationLabel(row.city, row.country)}
                        {row.location?.trim() ? (
                          <span className="block text-xs text-text-hint">{row.location}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.owner_name || "-"}
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
                      <td className="px-4 py-3 tabular-nums text-xs">
                        {gymPlatformFeeLabel(row.monthly_payment)}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {row.membership_summary
                          ? `${row.membership_summary.active_entitlements ?? 0} entitlements · ${row.membership_summary.active_roster ?? 0} roster`
                          : "-"}
                      </td>
                      {canWrite ? (
                        <td
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <GymActionsMenu
                            row={row}
                            busy={busyId === row.id}
                            onEdit={() => openEdit(row)}
                            onAction={(actionId, needsReason) =>
                              void runGymAction(row.id, actionId, needsReason)
                            }
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
      </div>

      {/* Mobile Empty State */}
      {!loading && filtered.length === 0 ? (
        <div className="lg:hidden">
          <AdminEmpty
            title="No gyms"
            description={
              canWrite
                ? "Add a gym venue, or wait for submissions from the app."
                : "Gym venues from SpoJex appear here."
            }
          />
        </div>
      ) : null}

      {/* Create Modal */}
      <AdminModal
        open={createOpen}
        title="Add gym"
        onClose={() => {
          if (creating) return;
          setCreateOpen(false);
        }}
        className="max-w-2xl"
        sheet
        footer={
          <AdminModalFooter
            onCancel={() => setCreateOpen(false)}
            onSave={create}
            saving={creating}
            disabled={!form.name.trim() || !form.owner_user_id.trim()}
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
                <span className="text-text-secondary">Monthly platform fee (ETB)</span>
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
              Owner (required)
            </h3>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Link existing SpoJex user</span>
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
                placeholder="Search by name or email"
                required
              />
              {selectedOwner ? (
                <p className="text-xs text-emerald-700">
                  Linked: {selectedOwner.display_name}
                  {selectedOwner.email ? ` · ${selectedOwner.email}` : ""}
                </p>
              ) : (
                <p className="text-xs text-text-secondary">
                  Required. Pick a user from the results - create the account under Users first if
                  they are not listed.
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

      {/* Edit Modal */}
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
            disabled={!draft?.name.trim() || !draft?.owner_user_id.trim()}
            saveLabel="Save changes"
          />
        }
      >
        {draft ? (
          <div className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-hint">
                Owner (required)
              </h3>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Link existing SpoJex user</span>
                <input
                  value={ownerQuery}
                  onChange={(event) => {
                    setOwnerQuery(event.target.value);
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            owner_user_id: "",
                          }
                        : prev,
                    );
                  }}
                  className={fieldClass}
                  placeholder="Search by name or email to change owner"
                  disabled={saving || !canWrite}
                />
                {draft.owner_user_id ? (
                  <p className="text-xs text-emerald-700">
                    Linked:{" "}
                    {selectedEditOwner?.display_name ||
                      draft.owner_name ||
                      draft.owner_user_id}
                    {selectedEditOwner?.email
                      ? ` · ${selectedEditOwner.email}`
                      : ""}
                  </p>
                ) : (
                  <p className="text-xs text-text-secondary">
                    Required. Search and pick a user to set or change the gym owner.
                  </p>
                )}
                {ownerLoading ? <p className="text-xs text-text-hint">Searching…</p> : null}
                {ownerOptions.length > 0 ? (
                  <ul className="max-h-40 overflow-y-auto rounded-lg border border-border">
                    {ownerOptions.map((owner) => (
                      <li key={owner.id}>
                        <button
                          type="button"
                          disabled={saving || !canWrite}
                          onClick={() => {
                            setDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    owner_user_id: owner.id,
                                    owner_name: owner.display_name || prev.owner_name,
                                  }
                                : prev,
                            );
                            setOwnerQuery(owner.email || owner.display_name);
                          }}
                          className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 ${
                            draft.owner_user_id === owner.id ? "bg-primary/10" : ""
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
            </section>

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
                  <span className="text-text-secondary">Monthly platform fee (ETB)</span>
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
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
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
              </div>
            </section>
          </div>
        ) : null}
      </AdminModal>
    </>
  );
}
