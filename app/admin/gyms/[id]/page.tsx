"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  gymAllowedActions,
  gymActionPatch,
  type GymActionId,
} from "@/lib/gym-actions";
import {
  classifyGymMemberEntitlement,
  gymCategories,
  gymCategoryLabel,
  gymFeatureLabel,
  gymPlanMonthsLabel,
  gymPlatformFeeLabel,
  gymRatingLabel,
  gymStaffRoleLabel,
  gymStaffRoles,
  gymStatusLabel,
  gymStatuses,
  gymVerificationLabel,
  gymVerificationStatuses,
  type GymCategoryRow,
  type GymMemberRow,
  type GymMembershipSummary,
  type GymPlanRow,
  type GymRow,
  type GymStaffRow,
} from "@/lib/gyms";
import {
  adminFetch,
  deleteAdmin,
  patchAdmin,
  postAdmin,
  postAdminResponse,
} from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { formatDate, formatMoney, locationLabel } from "@/lib/utils";

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const areaClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type TabId = "overview" | "memberships" | "team" | "finance" | "settings";
type MembershipView = "plans" | "members";
type ImageKind = "logo" | "cover";
type OwnerOption = {
  id: string;
  display_name: string;
  email?: string | null;
  role?: string | null;
  city?: string | null;
};
type GymPaymentRow = {
  id: string;
  amount: number;
  currency: string;
  commission_amount?: number | null;
  gym_net_amount?: number | null;
  payment_type: string;
  status: string;
  paid_at?: string | null;
  created_at: string;
};

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "memberships", label: "Memberships" },
  { id: "team", label: "Team" },
  { id: "finance", label: "Finance" },
  { id: "settings", label: "Settings" },
];

const MONTH_PRESETS = [1, 3, 6, 12] as const;

function validateImageFile(file: File) {
  if (!IMAGE_ACCEPT.split(",").includes(file.type)) {
    throw new Error("Use a JPG, PNG, WebP, or GIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
}

function membershipPlanTitle(row: GymMembershipSummary) {
  const plan = row.gym_plans;
  if (!plan) return null;
  if (Array.isArray(plan)) return plan[0]?.title ?? null;
  return plan.title ?? null;
}

function latestMembership(member: GymMemberRow): GymMembershipSummary | null {
  const list = member.gym_memberships ?? [];
  if (!list.length) return null;
  return list[0] ?? null;
}

function ImageField({
  label,
  previewUrl,
  inputRef,
  disabled,
  uploading,
  onPick,
  onClear,
  onRemoveRemote,
  canRemoveRemote,
}: {
  label: string;
  previewUrl: string;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  uploading?: boolean;
  onPick: (file: File) => void;
  onClear?: () => void;
  onRemoveRemote?: () => void | Promise<void>;
  canRemoveRemote?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-text-secondary">{label}</p>
      <div className="flex items-start gap-3">
        <div className="h-20 w-28 overflow-hidden rounded-lg border border-border bg-muted">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-text-secondary">
              No image
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onPick(file);
            }}
          />
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {previewUrl && onClear ? (
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={onClear}
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
  );
}

export default function GymDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAdminPermissions();
  const canWrite = can("gyms:write");
  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<TabId>("overview");
  const [membershipView, setMembershipView] = useState<MembershipView>("plans");
  const [gym, setGym] = useState<GymRow | null>(null);
  const [catalog, setCatalog] = useState<GymCategoryRow[]>([]);
  const [staff, setStaff] = useState<GymStaffRow[]>([]);
  const [members, setMembers] = useState<GymMemberRow[]>([]);
  const [plans, setPlans] = useState<GymPlanRow[]>([]);
  const [payments, setPayments] = useState<GymPaymentRow[]>([]);
  const [memberFilter, setMemberFilter] = useState("all");
  const [selectedMember, setSelectedMember] = useState<GymMemberRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownershipReason, setOwnershipReason] = useState("");
  const [uploadingKind, setUploadingKind] = useState<ImageKind | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState<GymPlanRow | null>(null);
  const [planDraft, setPlanDraft] = useState({
    title: "",
    description: "",
    price_amount: "0",
    currency: "ETB",
    duration_months: "1",
    is_active: true,
  });

  const [draft, setDraft] = useState({
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
    owner_name: "",
    status: "pending",
    verification_status: "pending",
  });

  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [pendingOwnerId, setPendingOwnerId] = useState("");
  const [pendingOwnerName, setPendingOwnerName] = useState("");

  const [staffOpen, setStaffOpen] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffRole, setStaffRole] = useState("manager");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffFullName, setStaffFullName] = useState("");
  const [staffNotice, setStaffNotice] = useState<string | null>(null);
  const [staffMode, setStaffMode] = useState<"assign" | "invite">("assign");

  const load = async () => {
    const [response, categoriesRes] = await Promise.all([
      fetch(`/api/admin/gyms/${id}`, { credentials: "same-origin" }),
      getSpojexClient().from("gym_categories").select("*").order("sort_order"),
    ]);
    const payload = (await response.json()) as {
      data?: GymRow;
      staff?: GymStaffRow[];
      members?: GymMemberRow[];
      plans?: GymPlanRow[];
      payments?: GymPaymentRow[];
      staff_error?: string | null;
      members_error?: string | null;
      plans_error?: string | null;
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load gym");
    const next = payload.data ?? null;
    setGym(next);
    setStaff(payload.staff ?? []);
    setMembers(payload.members ?? []);
    setPlans(payload.plans ?? []);
    setPayments(payload.payments ?? []);
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
    if (payload.staff_error) setError(payload.staff_error);
    if (payload.members_error) setError(payload.members_error);
    if (payload.plans_error) setError(payload.plans_error);
    if (next) {
      const ownerId = next.owner_user_id ?? "";
      const ownerLabel =
        next.users?.display_name ||
        next.owner_name ||
        next.users?.email ||
        ownerId ||
        "";
      setDraft({
        name: next.name ?? "",
        category: next.category || "gym",
        city: next.city ?? "",
        country: next.country ?? "ET",
        location: next.location ?? "",
        address: next.address ?? "",
        description: next.description ?? "",
        contact_phone: next.contact_phone ?? "",
        contact_email: next.contact_email ?? "",
        website: next.website ?? "",
        monthly_payment: String(next.monthly_payment ?? 0),
        owner_user_id: ownerId,
        owner_name: next.owner_name ?? "",
        status: next.status || "pending",
        verification_status: next.verification_status || "pending",
      });
      setPendingOwnerId(ownerId);
      setPendingOwnerName(next.owner_name ?? ownerLabel);
      setOwnerQuery(ownerLabel);
      setOwnerOptions([]);
    }
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!canWrite) return;
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
  }, [canWrite, ownerQuery]);

  const save = async (patch: Record<string, unknown>, success = "Saved.") => {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(`/api/admin/gyms/${id}`, patch);
      await load();
      setNotice(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    const monthly = Number(draft.monthly_payment);
    if (!Number.isFinite(monthly) || monthly < 0) {
      setError("Monthly platform fee must be a non-negative number");
      return;
    }
    await save(
      {
        name: draft.name.trim(),
        category: draft.category,
        city: draft.city.trim(),
        country: draft.country.trim() || "ET",
        location: draft.location.trim(),
        address: draft.address.trim(),
        description: draft.description.trim(),
        contact_phone: draft.contact_phone.trim(),
        contact_email: draft.contact_email.trim(),
        website: draft.website.trim(),
        monthly_payment: monthly,
        status: draft.status,
        verification_status: draft.verification_status,
      },
      "Gym details updated.",
    );
  };

  const saveOwner = async () => {
    if (!canWrite) return;
    const ownerId = pendingOwnerId.trim();
    if (!ownerId) {
      setError("Select an existing SpoJex user as the gym owner.");
      return;
    }
    if (ownerId === (gym?.owner_user_id ?? "")) {
      setNotice("Owner is already assigned.");
      return;
    }
    const reason = ownershipReason.trim();
    if (!reason) {
      setError("A reason is required to reassign gym ownership.");
      return;
    }
    await save(
      {
        action: "transfer_ownership",
        owner_user_id: ownerId,
        reason,
        idempotency_key: `${id}:transfer_ownership:${ownerId}:${Date.now()}`,
      },
      "Gym owner reassigned. Historical payments were not rewritten.",
    );
    setOwnershipReason("");
  };

  const uploadImage = async (kind: ImageKind, file: File) => {
    if (!canWrite) return;
    try {
      validateImageFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid image");
      return;
    }
    setUploadingKind(kind);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const response = await adminFetch(`/api/admin/gyms/${id}/image`, {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      await load();
      setNotice(`${kind === "logo" ? "Logo" : "Cover"} updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingKind(null);
      if (kind === "logo" && logoRef.current) logoRef.current.value = "";
      if (kind === "cover" && coverRef.current) coverRef.current.value = "";
    }
  };

  const removeImage = async (kind: ImageKind) => {
    if (!canWrite) return;
    setUploadingKind(kind);
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/gyms/${id}/image?kind=${kind}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Remove failed");
      await load();
      setNotice(`${kind === "logo" ? "Logo" : "Cover"} removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploadingKind(null);
    }
  };

  const addStaff = async () => {
    const email = staffEmail.trim().toLowerCase();
    if (!canWrite || !email.includes("@")) {
      setError("Enter a SpoJex user email.");
      return;
    }
    setSavingStaff(true);
    setError(null);
    setStaffNotice(null);
    const inviting = staffMode === "invite";
    try {
      const payload = await postAdminResponse(`/api/admin/gyms/${id}/staff`, {
        user_email: email,
        full_name: staffFullName.trim() || undefined,
        staff_role: staffRole,
        is_active: true,
        create_if_missing: inviting,
        invite: inviting,
      });
      setStaffOpen(false);
      setStaffEmail("");
      setStaffFullName("");
      setStaffRole("manager");
      setStaffMode("assign");
      await load();
      setStaffNotice(
        typeof payload.message === "string"
          ? payload.message
          : "Staff assignment updated. Platform profile role was not changed.",
      );
      setNotice(inviting ? "Invitation sent." : "Staff member assigned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add staff failed");
    } finally {
      setSavingStaff(false);
    }
  };

  const patchStaff = async (row: GymStaffRow, patch: Record<string, unknown>) => {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/gyms/${id}/staff/${row.id}`, patch);
      await load();
      setNotice("Staff updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Staff update failed");
    } finally {
      setBusy(false);
    }
  };

  const removeStaff = async (row: GymStaffRow) => {
    if (!canWrite) return;
    const label = row.users?.display_name || "this staff member";
    if (!window.confirm(`Remove ${label} from this gym?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdmin(`/api/admin/gyms/${id}/staff/${row.id}`);
      await load();
      setNotice("Staff removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  };

  const ensureOrgChat = async () => {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    try {
      await postAdminResponse(`/api/admin/gyms/${id}/ensure-org`, {});
      await load();
      setNotice("Gym organization chat linked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable gym chat");
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (row: GymMemberRow) => {
    if (!canWrite) return;
    const label = row.full_name || "this member";
    if (!window.confirm(`Remove ${label} from this gym? Their membership will be deleted.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAdmin(`/api/admin/gyms/${id}/members/${row.id}`);
      await load();
      setNotice("Member removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  };

  const openCreatePlan = () => {
    setEditingPlan(null);
    setPlanDraft({
      title: "",
      description: "",
      price_amount: "0",
      currency: "ETB",
      duration_months: "1",
      is_active: true,
    });
    setPlanOpen(true);
  };

  const openEditPlan = (row: GymPlanRow) => {
    const months =
      row.duration_months && row.duration_months > 0
        ? row.duration_months
        : Math.max(1, Math.round((row.duration_days || 30) / 30));
    setEditingPlan(row);
    setPlanDraft({
      title: row.title ?? "",
      description: row.description ?? "",
      price_amount: String(row.price_amount ?? 0),
      currency: row.currency || "ETB",
      duration_months: String(months),
      is_active: row.is_active !== false,
    });
    setPlanOpen(true);
  };

  const savePlan = async () => {
    if (!canWrite) return;
    const title = planDraft.title.trim();
    if (!title) {
      setError("Plan title is required");
      return;
    }
    const months = Math.max(1, Math.floor(Number(planDraft.duration_months) || 1));
    const price = Number(planDraft.price_amount);
    if (!Number.isFinite(price) || price < 0) {
      setError("Price must be 0 or more");
      return;
    }
    setSavingPlan(true);
    setError(null);
    try {
      const body = {
        title,
        description: planDraft.description.trim(),
        price_amount: price,
        currency: planDraft.currency.trim() || "ETB",
        duration_months: months,
        is_active: planDraft.is_active,
      };
      if (editingPlan) {
        await patchAdmin(`/api/admin/gyms/${id}/plans/${editingPlan.id}`, body);
        setNotice("Membership plan updated.");
      } else {
        await postAdmin(`/api/admin/gyms/${id}/plans`, body);
        setNotice("Membership plan created.");
      }
      setPlanOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save plan");
    } finally {
      setSavingPlan(false);
    }
  };

  const removePlan = async (row: GymPlanRow) => {
    if (!canWrite) return;
    if (
      !window.confirm(
        `Remove "${row.title}"? If members already used this plan it will be deactivated instead.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAdmin(`/api/admin/gyms/${id}/plans/${row.id}`);
      await load();
      setNotice("Membership plan removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove plan");
    } finally {
      setBusy(false);
    }
  };

  const toggleMember = async (row: GymMemberRow) => {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/gyms/${id}/members/${row.id}`, {
        is_active: !row.is_active,
      });
      await load();
      setNotice(row.is_active ? "Member deactivated." : "Member activated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Member update failed");
    } finally {
      setBusy(false);
    }
  };

  const activeStaff = useMemo(() => staff.filter((row) => row.is_active).length, [staff]);
  const activeMembers = useMemo(() => members.filter((row) => row.is_active).length, [members]);

  if (loading) return <AdminLoadingRow label="Loading gym…" />;
  if (!gym) return <AdminErrorAlert message={error || "Gym not found"} />;

  return (
    <>
      <AdminPageHeader
        title={gym.name || "Gym"}
        description={[gymCategoryLabel(gym.category, catalog), gym.slug, locationLabel(gym.city, gym.country)]
          .filter((item) => item && item !== "—")
          .join(" · ")}
        backHref="/admin/gyms"
        stackOnSmall
        breadcrumbs={[
          { label: "Gyms", href: "/admin/gyms" },
          { label: gym.name || "Detail" },
        ]}
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              {gymAllowedActions(gym)
                .filter((item) => item.id !== "edit")
                .slice(0, 6)
                .map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={busy}
                    title={action.description}
                    onClick={() => {
                      let reason: string | undefined;
                      if (action.needsReason) {
                        const prompted = window.prompt(`Reason for ${action.label} (required):`);
                        if (!prompted?.trim()) return;
                        reason = prompted.trim();
                      }
                      const patch = gymActionPatch(action.id as GymActionId);
                      if (!patch) return;
                      void save(
                        {
                          ...patch,
                          ...(reason ? { reason } : {}),
                          idempotency_key: `${gym.id}:${action.id}:${Date.now()}`,
                        },
                        `${action.label} applied.`,
                      );
                    }}
                    className={
                      action.tone === "success"
                        ? "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        : action.tone === "danger"
                          ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                          : "rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    }
                  >
                    {action.label}
                  </button>
                ))}
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
            {item.id === "memberships" ? ` (${plans.length}/${members.length})` : null}
            {item.id === "team" ? ` (${staff.length})` : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: "Status", value: gymStatusLabel(gym.status) },
              { label: "Verification", value: gymVerificationLabel(gym.verification_status) },
              {
                label: "Featured",
                value: gymFeatureLabel(gym.feature_status, gym.is_featured),
              },
              { label: "Staff", value: `${activeStaff} active / ${staff.length}` },
              { label: "Members", value: `${activeMembers} active / ${members.length}` },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-hint">
                  {item.label}
                </p>
                <p className="mt-2 text-lg font-semibold text-text-primary">{item.value}</p>
              </div>
            ))}
          </section>

          {gym.feature_status === "pending" || gym.is_featured || gym.feature_status === "rejected" ? (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-heading text-sm font-semibold">Featured placement</h2>
                <StatusBadge
                  tone={
                    gym.is_featured
                      ? "success"
                      : gym.feature_status === "pending"
                        ? "warning"
                        : gym.feature_status === "rejected"
                          ? "danger"
                          : "neutral"
                  }
                >
                  {gymFeatureLabel(gym.feature_status, gym.is_featured)}
                </StatusBadge>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-text-secondary">Requested</dt>
                  <dd className="font-medium">
                    {gym.feature_requested_at ? formatDate(gym.feature_requested_at) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-text-secondary">Reviewed</dt>
                  <dd className="font-medium">
                    {gym.feature_reviewed_at ? formatDate(gym.feature_reviewed_at) : "—"}
                  </dd>
                </div>
              </dl>
              {canWrite && gym.feature_status === "pending" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void save(
                        { action: "review_featured", approve: true },
                        "Feature request approved.",
                      )
                    }
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    Approve featured
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void save(
                        { action: "review_featured", approve: false },
                        "Feature request rejected.",
                      )
                    }
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    Reject featured
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-4 font-heading text-sm font-semibold">Media</h2>
              <div className="space-y-5">
                <div className="overflow-hidden rounded-xl border border-border bg-muted">
                  {gym.cover_url?.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={gym.cover_url}
                      alt=""
                      className="h-36 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center text-sm text-text-secondary">
                      No cover
                    </div>
                  )}
                </div>
                <div className="flex justify-center">
                  <div className="h-24 w-24 overflow-hidden rounded-2xl border border-border bg-muted">
                    {gym.logo_url?.trim() ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={gym.logo_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-text-secondary">
                        {(gym.name || "G").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
                {canWrite ? (
                  <div className="space-y-4">
                    <ImageField
                      label="Logo"
                      previewUrl={gym.logo_url?.trim() || ""}
                      inputRef={logoRef}
                      disabled={busy}
                      uploading={uploadingKind === "logo"}
                      onPick={(file) => void uploadImage("logo", file)}
                      canRemoveRemote={Boolean(gym.logo_url?.trim())}
                      onRemoveRemote={() => removeImage("logo")}
                    />
                    <ImageField
                      label="Cover"
                      previewUrl={gym.cover_url?.trim() || ""}
                      inputRef={coverRef}
                      disabled={busy}
                      uploading={uploadingKind === "cover"}
                      onPick={(file) => void uploadImage("cover", file)}
                      canRemoveRemote={Boolean(gym.cover_url?.trim())}
                      onRemoveRemote={() => removeImage("cover")}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            <div className="space-y-6">
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-heading text-sm font-semibold">Profile</h2>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={requestTone(gym.status)}>
                      {gymStatusLabel(gym.status)}
                    </StatusBadge>
                    <StatusBadge tone={requestTone(gym.verification_status)}>
                      {gymVerificationLabel(gym.verification_status)}
                    </StatusBadge>
                  </div>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-3 sm:col-span-2">
                    <dt className="text-text-secondary">Name</dt>
                    <dd className="font-medium text-right">{gym.name}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Slug</dt>
                    <dd className="font-mono text-xs">{gym.slug || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Category</dt>
                    <dd className="font-medium">{gymCategoryLabel(gym.category, catalog)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:col-span-2">
                    <dt className="text-text-secondary">Description</dt>
                    <dd className="max-w-[70%] text-right text-text-primary">
                      {gym.description?.trim() || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">City / country</dt>
                    <dd className="font-medium">{locationLabel(gym.city, gym.country)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Area</dt>
                    <dd className="font-medium text-right">{gym.location || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:col-span-2">
                    <dt className="text-text-secondary">Address</dt>
                    <dd className="font-medium text-right">{gym.address || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Phone</dt>
                    <dd className="font-medium">{gym.contact_phone || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Email</dt>
                    <dd className="font-medium text-right">{gym.contact_email || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:col-span-2">
                    <dt className="text-text-secondary">Website</dt>
                    <dd className="font-medium text-right">
                      {gym.website?.trim() ? (
                        <a
                          href={gym.website.startsWith("http") ? gym.website : `https://${gym.website}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {gym.website}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Monthly platform fee</dt>
                    <dd className="font-medium tabular-nums">
                      {gymPlatformFeeLabel(gym.monthly_payment)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Commission (per txn)</dt>
                    <dd className="font-medium tabular-nums">
                      {gym.commission_pct == null ? "—" : `${gym.commission_pct}%`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Rating</dt>
                    <dd className="font-medium">
                      {gymRatingLabel(gym.rating_avg, gym.rating_count)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Followers</dt>
                    <dd className="font-medium tabular-nums">{gym.follower_count ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Created</dt>
                    <dd className="font-medium">{formatDate(gym.created_at)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Updated</dt>
                    <dd className="font-medium">
                      {gym.updated_at ? formatDate(gym.updated_at) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Org chat</dt>
                    <dd>
                      {gym.organization_id ? (
                        <Link
                          href={`/admin/organizations/${gym.organization_id}`}
                          className="font-medium text-primary"
                        >
                          Linked organization
                        </Link>
                      ) : (
                        <span className="text-text-secondary">Not linked</span>
                      )}
                    </dd>
                  </div>
                </dl>
                {!gym.organization_id && gym.owner_user_id && canWrite ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void ensureOrgChat()}
                    className="mt-4 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Enable gym chat
                  </button>
                ) : null}
              </section>

              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-4 font-heading text-sm font-semibold">Owner</h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Display name</dt>
                    <dd className="font-medium">{gym.owner_name || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">User</dt>
                    <dd>
                      {gym.users ? (
                        <Link
                          href={`/admin/users/${gym.users.id}`}
                          className="font-medium text-primary"
                        >
                          {gym.users.display_name || gym.users.email || "View profile"}
                        </Link>
                      ) : gym.owner_user_id ? (
                        <Link
                          href={`/admin/users/${gym.owner_user_id}`}
                          className="font-medium text-primary"
                        >
                          View profile
                        </Link>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Email</dt>
                    <dd className="font-medium">{gym.users?.email || gym.contact_email || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Owner ID</dt>
                    <dd
                      className="max-w-[200px] truncate font-mono text-xs"
                      title={gym.owner_user_id ?? undefined}
                    >
                      {gym.owner_user_id || "—"}
                    </dd>
                  </div>
                </dl>
                {canWrite ? (
                  <p className="mt-4 border-t border-border pt-4 text-xs text-text-secondary">
                    Ownership reassignment and listing/verification edits live in{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setTab("settings")}
                    >
                      Settings
                    </button>
                    . Use header actions for contextual approve / suspend / feature.
                  </p>
                ) : null}
              </section>

            </div>
          </div>
        </div>
      ) : null}

      {tab === "memberships" ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMembershipView("plans")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              membershipView === "plans"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card hover:bg-muted"
            }`}
          >
            Plans ({plans.length})
          </button>
          <button
            type="button"
            onClick={() => setMembershipView("members")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              membershipView === "members"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card hover:bg-muted"
            }`}
          >
            Members ({members.length})
          </button>
          <p className="w-full text-xs text-text-hint">
            Community roster (`gym_members`) is separate from paid entitlements (`gym_memberships`).
            Active roster ≠ paid membership.
          </p>
        </div>
      ) : null}

      {tab === "memberships" && membershipView === "plans" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-sm font-semibold">Membership plans</h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Packages members choose in the app. Duration in months sets when a subscription
                  expires.
                </p>
              </div>
              {canWrite ? (
                <button
                  type="button"
                  onClick={openCreatePlan}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  Add plan
                </button>
              ) : null}
            </div>
            {plans.length === 0 ? (
              <AdminEmpty
                title="No membership plans"
                description={
                  canWrite
                    ? "Add Monthly, Quarterly, or custom packages with a month length."
                    : "Membership packages for this gym appear here."
                }
              />
            ) : (
              <AdminTableShell>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Plan</th>
                        <th className="px-4 py-3 font-semibold">Months</th>
                        <th className="px-4 py-3 font-semibold">Price</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        {canWrite ? (
                          <th className="px-4 py-3 font-semibold">Actions</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map((row) => (
                        <tr key={row.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            <p className="font-medium">{row.title}</p>
                            {row.description ? (
                              <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">
                                {row.description}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {gymPlanMonthsLabel(row.duration_months, row.duration_days)}
                          </td>
                          <td className="px-4 py-3">
                            {formatMoney(row.price_amount, row.currency || "ETB")}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={row.is_active ? "success" : "neutral"}>
                              {row.is_active ? "Active" : "Inactive"}
                            </StatusBadge>
                          </td>
                          {canWrite ? (
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => openEditPlan(row)}
                                  className="text-sm text-primary hover:underline disabled:opacity-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    void (async () => {
                                      setBusy(true);
                                      setError(null);
                                      try {
                                        await patchAdmin(
                                          `/api/admin/gyms/${id}/plans/${row.id}`,
                                          { is_active: !row.is_active },
                                        );
                                        await load();
                                        setNotice(
                                          row.is_active
                                            ? "Plan deactivated."
                                            : "Plan activated.",
                                        );
                                      } catch (err) {
                                        setError(
                                          err instanceof Error
                                            ? err.message
                                            : "Could not update plan",
                                        );
                                      } finally {
                                        setBusy(false);
                                      }
                                    })();
                                  }}
                                  className="text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
                                >
                                  {row.is_active ? "Deactivate" : "Activate"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void removePlan(row)}
                                  className="text-sm text-red-600 disabled:opacity-50"
                                >
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

      {tab === "team" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-sm font-semibold">Gym team</h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Assign an existing Spojex user, or invite a new one. Gym staff role is separate
                  from their platform sports/profile role — assigning staff never overwrites it.
                  Passwords are never shown in admin.
                </p>
                {staffNotice ? (
                  <p className="mt-2 text-xs text-emerald-800">{staffNotice}</p>
                ) : null}
              </div>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => {
                    setStaffOpen(true);
                    setError(null);
                    setStaffMode("assign");
                  }}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  Assign / invite staff
                </button>
              ) : null}
            </div>
            {staff.length === 0 ? (
              <AdminEmpty
                title="No staff"
                description={
                  canWrite
                    ? "Add an owner or manager linked to a SpoJex user."
                    : "Staff assignments appear here."
                }
              />
            ) : (
              <AdminTableShell>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-semibold">User</th>
                        <th className="px-4 py-3 font-semibold">Role</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Added</th>
                        {canWrite ? (
                          <th className="px-4 py-3 font-semibold">Actions</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map((row) => (
                        <tr key={row.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            {row.users ? (
                              <div>
                                <Link
                                  href={`/admin/users/${row.users.id}`}
                                  className="font-medium text-primary"
                                >
                                  {row.users.display_name || "User"}
                                </Link>
                                <p className="text-xs text-text-secondary">
                                  {row.users.email || row.users.phone || ""}
                                </p>
                              </div>
                            ) : (
                              <span className="font-mono text-xs">{row.user_id}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {canWrite ? (
                              <select
                                className="h-8 rounded-md border border-border bg-card px-2 text-xs"
                                value={row.staff_role}
                                disabled={busy}
                                onChange={(event) =>
                                  void patchStaff(row, { staff_role: event.target.value })
                                }
                              >
                                {gymStaffRoles.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              gymStaffRoleLabel(row.staff_role)
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={row.is_active ? "success" : "neutral"}>
                              {row.is_active ? "Active" : "Inactive"}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {formatDate(row.created_at)}
                          </td>
                          {canWrite ? (
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void patchStaff(row, { is_active: !row.is_active })
                                  }
                                  className="text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
                                >
                                  {row.is_active ? "Deactivate" : "Activate"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void removeStaff(row)}
                                  className="text-sm text-red-600 disabled:opacity-50"
                                >
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

      {tab === "memberships" && membershipView === "members" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="font-heading text-sm font-semibold">Gym members</h2>
              <p className="mt-1 text-xs text-text-secondary">
                From <code className="text-[11px]">gym_members</code>
                {members.some((m) => (m.gym_memberships?.length ?? 0) > 0)
                  ? " with latest gym_memberships status"
                  : ""}
              </p>
            </div>
            {members.length === 0 ? (
              <AdminEmpty
                title="No members"
                description="Members enrolled at this gym appear here."
              />
            ) : (
              <AdminTableShell>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Member</th>
                        <th className="px-4 py-3 font-semibold">Community</th>
                        <th className="px-4 py-3 font-semibold">Access type</th>
                        <th className="px-4 py-3 font-semibold">Payment</th>
                        <th className="px-4 py-3 font-semibold">Entitlement</th>
                        <th className="px-4 py-3 font-semibold">Dates</th>
                        {canWrite ? (
                          <th className="px-4 py-3 font-semibold">Actions</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((row) => {
                        const membership = latestMembership(row);
                        const entitlement = classifyGymMemberEntitlement(row);
                        return (
                          <tr key={row.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                className="text-left font-medium text-primary hover:underline"
                                onClick={() => setSelectedMember(row)}
                              >
                                {row.full_name}
                              </button>
                              {row.users ? (
                                <Link
                                  href={`/admin/users/${row.users.id}`}
                                  className="block text-xs text-primary hover:underline"
                                >
                                  {row.users.display_name || "SpoJex profile"}
                                </Link>
                              ) : row.user_id ? (
                                <Link
                                  href={`/admin/users/${row.user_id}`}
                                  className="block text-xs text-primary hover:underline"
                                >
                                  View user
                                </Link>
                              ) : (
                                <p className="text-xs text-text-hint">No linked user</p>
                              )}
                              <p className="text-[10px] text-text-hint">Access code concealed</p>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge
                                tone={
                                  entitlement.community_status === "active"
                                    ? "success"
                                    : "neutral"
                                }
                              >
                                {entitlement.community_status}
                              </StatusBadge>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {entitlement.access_type.replace(/_/g, " ")}
                              {entitlement.plan_title ? (
                                <p className="mt-1 text-text-secondary">
                                  {entitlement.plan_title}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-xs">{entitlement.payment_state}</td>
                            <td className="px-4 py-3">
                              <StatusBadge tone={requestTone(entitlement.entitlement_status)}>
                                {entitlement.entitlement_status.replace(/_/g, " ")}
                              </StatusBadge>
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary">
                              {membership
                                ? [membership.start_date, membership.end_date]
                                    .filter(Boolean)
                                    .join(" → ") || "—"
                                : "—"}
                            </td>
                            {canWrite ? (
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    title="Deactivate keeps roster history; does not delete payments."
                                    onClick={() => void toggleMember(row)}
                                    className="text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
                                  >
                                    {row.is_active ? "Deactivate" : "Activate"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    title="Remove unlinks access; financial history is preserved."
                                    onClick={() => void removeMember(row)}
                                    className="text-sm text-red-600 disabled:opacity-50"
                                  >
                                    Remove
                                  </button>
                                </div>
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

      {tab === "finance" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-2 font-heading text-sm font-semibold">Finance</h2>
            <p className="mb-4 text-xs text-text-secondary">
              Customer membership payments are separate from the Gym→Spojex monthly platform fee.
              Platform fee invoice history is not available yet (shown as unavailable, not zero).
            </p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Monthly platform fee</dt>
                <dd className="font-medium">{gymPlatformFeeLabel(gym.monthly_payment)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Platform fee invoices</dt>
                <dd className="font-medium text-text-hint">Unavailable</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Commission %</dt>
                <dd className="font-medium">
                  {gym.commission_pct == null ? "—" : `${gym.commission_pct}%`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Ledger</dt>
                <dd>
                  <Link
                    href={`/admin/finance/transactions?module=gym&q=${gym.id}`}
                    className="text-primary hover:underline"
                  >
                    Open filtered Finance transactions
                  </Link>
                </dd>
              </div>
            </dl>
          </section>
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-heading text-sm font-semibold">
              Recent customer payments
            </h2>
            {payments.length === 0 ? (
              <AdminEmpty
                title="No payment records"
                description="Verified membership payments for this gym appear here."
              />
            ) : (
              <AdminTableShell>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-semibold">When</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Gross</th>
                        <th className="px-4 py-3 font-semibold">Commission</th>
                        <th className="px-4 py-3 font-semibold">Gym net</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((row) => (
                        <tr key={row.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 text-text-secondary">
                            {formatDate(row.paid_at || row.created_at)}
                          </td>
                          <td className="px-4 py-3">{row.payment_type}</td>
                          <td className="px-4 py-3 tabular-nums">
                            {formatMoney(row.amount, row.currency || "ETB")}
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            {row.commission_amount == null
                              ? "—"
                              : formatMoney(row.commission_amount, row.currency || "ETB")}
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            {row.gym_net_amount == null
                              ? "—"
                              : formatMoney(row.gym_net_amount, row.currency || "ETB")}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={requestTone(row.status)}>{row.status}</StatusBadge>
                          </td>
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

      {tab === "settings" ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-heading text-sm font-semibold">Edit gym</h2>
          {!canWrite ? (
            <p className="text-sm text-text-secondary">You have read-only access.</p>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-text-secondary">Name</span>
                  <input
                    className={fieldClass}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Category</span>
                  <select
                    className={fieldClass}
                    value={draft.category}
                    onChange={(event) => setDraft({ ...draft, category: event.target.value })}
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
                    className={fieldClass}
                    value={draft.monthly_payment}
                    onChange={(event) =>
                      setDraft({ ...draft, monthly_payment: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-text-secondary">Description</span>
                  <textarea
                    rows={4}
                    className={areaClass}
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">City</span>
                  <input
                    className={fieldClass}
                    value={draft.city}
                    onChange={(event) => setDraft({ ...draft, city: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Country</span>
                  <input
                    className={fieldClass}
                    value={draft.country}
                    onChange={(event) => setDraft({ ...draft, country: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Area / neighborhood</span>
                  <input
                    className={fieldClass}
                    value={draft.location}
                    onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Address</span>
                  <input
                    className={fieldClass}
                    value={draft.address}
                    onChange={(event) => setDraft({ ...draft, address: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Phone</span>
                  <input
                    className={fieldClass}
                    value={draft.contact_phone}
                    onChange={(event) =>
                      setDraft({ ...draft, contact_phone: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Email</span>
                  <input
                    className={fieldClass}
                    value={draft.contact_email}
                    onChange={(event) =>
                      setDraft({ ...draft, contact_email: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-text-secondary">Website</span>
                  <input
                    className={fieldClass}
                    value={draft.website}
                    onChange={(event) => setDraft({ ...draft, website: event.target.value })}
                  />
                </label>
                <div className="grid gap-2 sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                  <p className="text-sm font-medium text-text-primary">Ownership transfer</p>
                  <p className="text-xs text-text-secondary">
                    Current: {gym.owner_name || gym.users?.display_name || gym.owner_user_id || "—"}.
                    Does not move personal balances or rewrite historical payment recipients.
                  </p>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Proposed owner (search)</span>
                    <input
                      className={fieldClass}
                      value={ownerQuery}
                      disabled={busy}
                      onChange={(event) => {
                        setOwnerQuery(event.target.value);
                        setPendingOwnerId("");
                        setPendingOwnerName("");
                      }}
                      placeholder="Search by name or email"
                    />
                  </label>
                  {pendingOwnerId ? (
                    <p className="text-xs text-emerald-700">
                      Proposed: {pendingOwnerName || pendingOwnerId}
                    </p>
                  ) : null}
                  {ownerLoading ? (
                    <p className="text-xs text-text-hint">Searching…</p>
                  ) : null}
                  {ownerOptions.length > 0 ? (
                    <ul className="max-h-40 overflow-y-auto rounded-lg border border-border bg-card">
                      {ownerOptions.map((owner) => (
                        <li key={owner.id}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setPendingOwnerId(owner.id);
                              setPendingOwnerName(owner.display_name || owner.email || "");
                              setOwnerQuery(owner.email || owner.display_name);
                              setOwnerOptions([]);
                            }}
                            className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 ${
                              pendingOwnerId === owner.id ? "bg-primary/10" : ""
                            }`}
                          >
                            <span className="font-medium">{owner.display_name}</span>
                            <span className="text-xs text-text-secondary">
                              {[owner.email, owner.role, owner.city]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Reason (required)</span>
                    <input
                      className={fieldClass}
                      value={ownershipReason}
                      disabled={busy}
                      onChange={(event) => setOwnershipReason(event.target.value)}
                      placeholder="Why is ownership changing?"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !pendingOwnerId ||
                      pendingOwnerId === (gym.owner_user_id ?? "") ||
                      !ownershipReason.trim()
                    }
                    onClick={() => void saveOwner()}
                    className="rounded-md border border-amber-300 bg-card px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Apply ownership transfer
                  </button>
                </div>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Commission (read-only)</span>
                  <input
                    className={fieldClass}
                    disabled
                    value={
                      gym.commission_pct == null ? "—" : `${gym.commission_pct}%`
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Status</span>
                  <select
                    className={fieldClass}
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value })}
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
                    className={fieldClass}
                    value={draft.verification_status}
                    onChange={(event) =>
                      setDraft({ ...draft, verification_status: event.target.value })
                    }
                  >
                    {gymVerificationStatuses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy || !draft.name.trim()}
                  onClick={() => void saveEdit()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <AdminModal
        open={planOpen}
        title={editingPlan ? "Edit membership plan" : "Add membership plan"}
        onClose={() => {
          if (savingPlan) return;
          setPlanOpen(false);
        }}
        footer={
          <AdminModalFooter
            onCancel={() => setPlanOpen(false)}
            onSave={() => void savePlan()}
            saving={savingPlan}
            saveLabel={editingPlan ? "Save plan" : "Create plan"}
          />
        }
      >
        <div className="space-y-4">
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Title</span>
            <input
              className={fieldClass}
              value={planDraft.title}
              onChange={(event) =>
                setPlanDraft((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="Monthly membership"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Description</span>
            <textarea
              className={areaClass}
              rows={2}
              value={planDraft.description}
              onChange={(event) =>
                setPlanDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Access hours, perks, etc."
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Price</span>
              <input
                className={fieldClass}
                type="number"
                min={0}
                step="1"
                value={planDraft.price_amount}
                onChange={(event) =>
                  setPlanDraft((prev) => ({ ...prev, price_amount: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Currency</span>
              <input
                className={fieldClass}
                value={planDraft.currency}
                onChange={(event) =>
                  setPlanDraft((prev) => ({ ...prev, currency: event.target.value }))
                }
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Duration (months)</span>
            <div className="flex flex-wrap gap-2">
              {MONTH_PRESETS.map((months) => (
                <button
                  key={months}
                  type="button"
                  onClick={() =>
                    setPlanDraft((prev) => ({ ...prev, duration_months: String(months) }))
                  }
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                    planDraft.duration_months === String(months)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-text-secondary hover:bg-muted"
                  }`}
                >
                  {months === 1 ? "1 month" : `${months} months`}
                </button>
              ))}
            </div>
            <input
              className={`${fieldClass} mt-2`}
              type="number"
              min={1}
              step={1}
              value={planDraft.duration_months}
              onChange={(event) =>
                setPlanDraft((prev) => ({ ...prev, duration_months: event.target.value }))
              }
              placeholder="Custom months"
            />
            <p className="text-xs text-text-hint">
              Used by the API to set membership end date (calendar months from purchase).
            </p>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={planDraft.is_active}
              onChange={(event) =>
                setPlanDraft((prev) => ({ ...prev, is_active: event.target.checked }))
              }
              className="h-4 w-4 rounded border-border"
            />
            <span>Active (visible in the app)</span>
          </label>
        </div>
      </AdminModal>

      <AdminModal
        open={staffOpen}
        title="Add gym staff"
        onClose={() => {
          if (savingStaff) return;
          setStaffOpen(false);
        }}
        footer={
          <AdminModalFooter
            onCancel={() => setStaffOpen(false)}
            onSave={addStaff}
            saving={savingStaff}
            saveLabel="Add staff"
          />
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStaffMode("assign")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                staffMode === "assign"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border"
              }`}
            >
              Assign existing user
            </button>
            <button
              type="button"
              onClick={() => setStaffMode("invite")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                staffMode === "invite"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border"
              }`}
            >
              Invite new staff
            </button>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Gym staff role</span>
            <select
              className={fieldClass}
              value={staffRole}
              onChange={(event) => setStaffRole(event.target.value)}
            >
              {gymStaffRoles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Spojex email</span>
            <input
              className={fieldClass}
              type="email"
              value={staffEmail}
              onChange={(event) => setStaffEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Display name (optional)</span>
            <input
              className={fieldClass}
              value={staffFullName}
              onChange={(event) => setStaffFullName(event.target.value)}
              placeholder="Used on invite profile only"
            />
          </label>
          <p className="text-xs text-text-secondary">
            {staffMode === "assign"
              ? "Looks up an existing Spojex user by email. Their platform profile role is left unchanged."
              : "Sends an Auth invitation / creates an activatable account. Passwords are never returned in admin responses."}
          </p>
        </div>
      </AdminModal>

      <AdminModal
        open={Boolean(selectedMember)}
        title={selectedMember?.full_name || "Member"}
        onClose={() => setSelectedMember(null)}
        footer={
          <AdminModalFooter
            onCancel={() => setSelectedMember(null)}
            onSave={() => setSelectedMember(null)}
            saveLabel="Close"
          />
        }
      >
        {selectedMember ? (
          <div className="space-y-3 text-sm">
            {(() => {
              const entitlement = classifyGymMemberEntitlement(selectedMember);
              const membership = latestMembership(selectedMember);
              return (
                <>
                  <p className="text-xs text-text-hint">
                    Access codes that grant entry are concealed in admin.
                  </p>
                  <dl className="grid gap-2">
                    <div className="flex justify-between gap-3">
                      <dt className="text-text-secondary">Community status</dt>
                      <dd>{entitlement.community_status}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-text-secondary">Access type</dt>
                      <dd>{entitlement.access_type.replace(/_/g, " ")}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-text-secondary">Payment state</dt>
                      <dd>{entitlement.payment_state}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-text-secondary">Entitlement</dt>
                      <dd>{entitlement.entitlement_status}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-text-secondary">Plan (snapshot)</dt>
                      <dd>{entitlement.plan_title || "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-text-secondary">Dates</dt>
                      <dd>
                        {membership
                          ? [membership.start_date, membership.end_date]
                              .filter(Boolean)
                              .join(" → ") || "—"
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs text-text-secondary">
                    Membership history, payments/refunds, renewals, and check-ins are scoped to
                    this gym. Deactivate = roster off (history kept). Remove = unlink access
                    (financial history preserved).
                  </p>
                </>
              );
            })()}
          </div>
        ) : null}
      </AdminModal>
    </>
  );
}
