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
  gymCategories,
  gymCategoryLabel,
  gymFeatureLabel,
  gymStaffRoleLabel,
  gymStaffRoles,
  gymStatusLabel,
  gymStatuses,
  gymVerificationLabel,
  gymVerificationStatuses,
  type GymCategoryRow,
  type GymMemberRow,
  type GymMembershipSummary,
  type GymRow,
  type GymStaffRow,
} from "@/lib/gyms";
import {
  adminFetch,
  deleteAdmin,
  patchAdmin,
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

type TabId = "overview" | "staff" | "members" | "edit";
type ImageKind = "logo" | "cover";

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "staff", label: "Staff" },
  { id: "members", label: "Members" },
  { id: "edit", label: "Edit" },
];

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
  const [gym, setGym] = useState<GymRow | null>(null);
  const [catalog, setCatalog] = useState<GymCategoryRow[]>([]);
  const [staff, setStaff] = useState<GymStaffRow[]>([]);
  const [members, setMembers] = useState<GymMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<ImageKind | null>(null);

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
    owner_name: "",
    status: "pending",
    verification_status: "pending",
  });

  const [staffOpen, setStaffOpen] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffRole, setStaffRole] = useState("manager");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffFullName, setStaffFullName] = useState("");
  const [staffCreds, setStaffCreds] = useState<{ email: string; password: string } | null>(
    null,
  );

  const load = async () => {
    const [response, categoriesRes] = await Promise.all([
      fetch(`/api/admin/gyms/${id}`, { credentials: "same-origin" }),
      getSpojexClient().from("gym_categories").select("*").order("sort_order"),
    ]);
    const payload = (await response.json()) as {
      data?: GymRow;
      staff?: GymStaffRow[];
      members?: GymMemberRow[];
      staff_error?: string | null;
      members_error?: string | null;
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load gym");
    const next = payload.data ?? null;
    setGym(next);
    setStaff(payload.staff ?? []);
    setMembers(payload.members ?? []);
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
    if (next) {
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
        owner_name: next.owner_name ?? "",
        status: next.status || "pending",
        verification_status: next.verification_status || "pending",
      });
    }
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
      setError("Monthly payment must be a non-negative number");
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
        owner_name: draft.owner_name.trim(),
        status: draft.status,
        verification_status: draft.verification_status,
      },
      "Gym details updated.",
    );
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
    try {
      const payload = await postAdminResponse(`/api/admin/gyms/${id}/staff`, {
        user_email: email,
        full_name: staffFullName.trim() || undefined,
        staff_role: staffRole,
        is_active: true,
        create_if_missing: true,
      });
      setStaffOpen(false);
      setStaffEmail("");
      setStaffFullName("");
      setStaffRole("manager");
      await load();
      if (payload.password) {
        setStaffCreds({ email, password: String(payload.password) });
        setNotice(payload.message || "Fan account created. Share the login below.");
      } else {
        setNotice("Staff linked to existing SpoJex user.");
      }
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
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save(
                    { status: "active", verification_status: "verified" },
                    "Gym approved.",
                  )
                }
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve
              </button>
              {gym.feature_status === "pending" ? (
                <>
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
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void save(
                      { is_featured: !gym.is_featured },
                      gym.is_featured ? "Gym unfeatured." : "Gym featured on home.",
                    )
                  }
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {gym.is_featured ? "Unfeature" : "Feature on home"}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save({ verification_status: "under_review" }, "Marked under review.")
                }
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Review
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save(
                    { status: "inactive", verification_status: "suspended" },
                    "Gym suspended.",
                  )
                }
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                Suspend
              </button>
              {gym.status !== "active" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save({ status: "active" }, "Status set to active.")}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Activate
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save({ status: "inactive" }, "Status set to inactive.")}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Deactivate
                </button>
              )}
              {gym.status !== "rejected" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void save(
                      { status: "rejected", verification_status: "rejected" },
                      "Gym rejected.",
                    )
                  }
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Reject
                </button>
              ) : null}
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
            {item.id === "staff" ? ` (${staff.length})` : null}
            {item.id === "members" ? ` (${members.length})` : null}
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
                    <dt className="text-text-secondary">Monthly payment</dt>
                    <dd className="font-medium tabular-nums">
                      {formatMoney(gym.monthly_payment ?? 0)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Commission</dt>
                    <dd className="font-medium tabular-nums">
                      {gym.commission_pct == null ? "—" : `${gym.commission_pct}%`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">Rating</dt>
                    <dd className="font-medium">
                      ⭐ {Number(gym.rating_avg ?? 0).toFixed(1)}
                      {gym.rating_count != null ? ` (${gym.rating_count})` : ""}
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
              </section>

              {canWrite ? (
                <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <h2 className="mb-4 font-heading text-sm font-semibold">Status controls</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <span className="text-text-secondary">Listing status</span>
                      <select
                        className={fieldClass}
                        value={gym.status}
                        disabled={busy}
                        onChange={(event) =>
                          void save({ status: event.target.value }, "Status updated.")
                        }
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
                        value={gym.verification_status}
                        disabled={busy}
                        onChange={(event) =>
                          void save(
                            { verification_status: event.target.value },
                            "Verification updated.",
                          )
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
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "staff" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-sm font-semibold">Gym staff</h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Add by SpoJex email only. Missing accounts become Fan logins (password shown once).
                </p>
              </div>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => {
                    setStaffOpen(true);
                    setError(null);
                  }}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  Add staff
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

      {tab === "members" ? (
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
                        <th className="px-4 py-3 font-semibold">Code</th>
                        <th className="px-4 py-3 font-semibold">Contact</th>
                        <th className="px-4 py-3 font-semibold">Membership</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Joined</th>
                        {canWrite ? (
                          <th className="px-4 py-3 font-semibold">Actions</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((row) => {
                        const membership = latestMembership(row);
                        const planTitle = membership
                          ? membershipPlanTitle(membership)
                          : null;
                        return (
                          <tr key={row.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-3">
                              <p className="font-medium">{row.full_name}</p>
                              {row.users ? (
                                <Link
                                  href={`/admin/users/${row.users.id}`}
                                  className="text-xs text-primary hover:underline"
                                >
                                  {row.users.display_name || "SpoJex profile"}
                                </Link>
                              ) : row.user_id ? (
                                <Link
                                  href={`/admin/users/${row.user_id}`}
                                  className="text-xs text-primary hover:underline"
                                >
                                  View user
                                </Link>
                              ) : (
                                <p className="text-xs text-text-hint">No linked user</p>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">{row.member_code}</td>
                            <td className="px-4 py-3 text-text-secondary">
                              <div className="space-y-0.5">
                                <p>{row.phone || "—"}</p>
                                <p className="text-xs">{row.email || ""}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {membership ? (
                                <div>
                                  <StatusBadge tone={requestTone(membership.status)}>
                                    {membership.status.replace(/_/g, " ")}
                                  </StatusBadge>
                                  {planTitle ? (
                                    <p className="mt-1 text-xs text-text-secondary">
                                      {planTitle}
                                    </p>
                                  ) : null}
                                  <p className="text-xs text-text-hint">
                                    {[membership.start_date, membership.end_date]
                                      .filter(Boolean)
                                      .join(" → ") || ""}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-text-secondary">—</span>
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
                                    onClick={() => void toggleMember(row)}
                                    className="text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
                                  >
                                    {row.is_active ? "Deactivate" : "Activate"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
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

      {tab === "edit" ? (
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
                  <span className="text-text-secondary">Monthly payment (ETB)</span>
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
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Owner display name</span>
                  <input
                    className={fieldClass}
                    value={draft.owner_name}
                    onChange={(event) =>
                      setDraft({ ...draft, owner_name: event.target.value })
                    }
                  />
                </label>
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
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Staff role</span>
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
              placeholder="Used if a Fan account is created"
            />
          </label>
          <p className="text-xs text-text-secondary">
            Existing Spojex users are linked. If the email is new, a Fan account is created and
            the password is shown once.
          </p>
        </div>
      </AdminModal>

      <AdminModal
        open={Boolean(staffCreds)}
        title="Fan login created"
        onClose={() => setStaffCreds(null)}
        footer={
          <AdminModalFooter
            onCancel={() => setStaffCreds(null)}
            onSave={() => setStaffCreds(null)}
            saveLabel="Done"
          />
        }
      >
        {staffCreds ? (
          <div className="space-y-3 text-sm">
            <p className="text-text-secondary">
              Share these credentials with the staff member. The password is shown only once.
            </p>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
              <p>
                <span className="text-text-secondary">Email: </span>
                {staffCreds.email}
              </p>
              <p className="mt-1">
                <span className="text-text-secondary">Password: </span>
                {staffCreds.password}
              </p>
            </div>
          </div>
        ) : null}
      </AdminModal>
    </>
  );
}
