"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
  type AdminRowMenuItem,
} from "@/components/admin-layout";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { gymAllowedActions } from "@/lib/gym-actions";
import {
  gymCategories,
  gymCategoryLabel,
  gymFeatureLabel,
  gymFeatureTone,
  gymListingTone,
  gymMemberAccessLabel,
  gymMemberAccessTone,
  gymMemberPlanLabel,
  gymMetricLabel,
  gymNum,
  gymPlanMonthsLabel,
  gymPlatformFeeLabel,
  gymRatingLabel,
  gymStaffRoleLabel,
  gymStaffRoles,
  gymStatusLabel,
  gymVerificationLabel,
  gymVerificationTone,
  type GymAdminEvent,
  type GymCategoryRow,
  type GymCommunity,
  type GymDirectoryMember,
  type GymFinance,
  type GymMemberDetail,
  type GymPlanRow,
  type GymRow,
  type GymStaffRow,
  type GymWorkspace,
} from "@/lib/gyms";
import { adminCacheKey, invalidateAdminCache } from "@/lib/admin-session-cache";
import {
  adminFetch,
  deleteAdmin,
  patchAdmin,
  postAdmin,
  postAdminResponse,
} from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useApplyAdminSnapshot } from "@/lib/use-admin-snapshot";
import {
  cn,
  formatDate,
  formatDateTime,
  formatMoney,
  formatStatusLabel,
  locationLabel,
} from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants & small shared helpers
// ---------------------------------------------------------------------------

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const areaClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";
const btnSecondary =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-text-primary hover:bg-muted disabled:opacity-50";
const btnDanger =
  "inline-flex h-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50";
const thClass = "px-4 py-3 font-semibold";
const theadClass = "border-b border-border bg-muted/50 text-xs uppercase text-text-secondary";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MONTH_PRESETS = [1, 3, 6, 12] as const;
const FINANCE_RANGES = [7, 30, 90, 365] as const;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "community", label: "Community" },
  { id: "finance", label: "Finance" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile & location" },
  { id: "media", label: "Media" },
  { id: "staff", label: "Staff & Access" },
  { id: "ownership", label: "Ownership" },
  { id: "history", label: "History" },
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];
type MembersView = "members" | "plans";
type ImageKind = "logo" | "cover";

type Notify = {
  success: (message: string) => void;
  error: (message: string) => void;
};

type Navigate = (next: {
  tab: TabId;
  view?: MembersView;
  section?: SettingsSection;
  edit?: boolean;
}) => void;

type UiAction = {
  id: string;
  label: string;
  tone: "default" | "success" | "danger";
  needsReason: boolean;
  description?: string;
};

type OwnerOption = {
  id: string;
  display_name: string;
  email?: string | null;
  role?: string | null;
  city?: string | null;
};

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

async function readJson<T extends object>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string };
}

/** Money from an API value; "Unavailable" when the backend did not provide it. */
function money(value: unknown, currency = "ETB") {
  const n = gymNum(value);
  return n === null ? "Unavailable" : formatMoney(n, currency);
}

/** Money for dense table cells. */
function moneyCell(value: unknown, currency = "ETB") {
  const n = gymNum(value);
  return n === null ? "-" : formatMoney(n, currency);
}

function paymentTone(status?: string | null): StatusTone {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
    case "paid":
    case "success":
    case "verified":
      return "success";
    case "pending":
      return "warning";
    case "refunded":
    case "partial_refund":
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function membershipStatusTone(status?: string | null): StatusTone {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return "success";
    case "pending":
    case "pending_payment":
      return "warning";
    case "expired":
    case "cancelled":
    case "canceled":
      return "danger";
    default:
      return "neutral";
  }
}

function dateRange(start?: string | null, end?: string | null) {
  const a = start ? formatDate(start) : null;
  const b = end ? formatDate(end) : null;
  if (!a && !b) return "-";
  return `${a ?? "-"} → ${b ?? "open-ended"}`;
}

function validateImageFile(file: File) {
  if (!IMAGE_ACCEPT.split(",").includes(file.type)) {
    throw new Error("Use a JPG, PNG, WebP, or GIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
}

function parseRoute(sp: { get(name: string): string | null }) {
  const raw = sp.get("tab") ?? "overview";
  let tab: TabId = "overview";
  let view: MembersView = "members";
  let section: SettingsSection = "profile";

  if (raw === "memberships") {
    // Legacy tab → Members (plans was the default sub-view).
    tab = "members";
    view = sp.get("view") === "members" ? "members" : "plans";
  } else if (raw === "team") {
    // Legacy tab → Settings / Staff & Access.
    tab = "settings";
    section = "staff";
  } else if (TABS.some((item) => item.id === raw)) {
    tab = raw as TabId;
  }

  if (tab === "members" && raw !== "memberships") {
    view = sp.get("view") === "plans" ? "plans" : "members";
  }
  if (tab === "settings" && raw !== "team") {
    const requested = sp.get("section");
    if (SETTINGS_SECTIONS.some((item) => item.id === requested)) {
      section = requested as SettingsSection;
    }
  }
  return { tab, view, section };
}

function resolveActions(ws: GymWorkspace | null, gym: GymRow): UiAction[] {
  const toTone = (tone: unknown): UiAction["tone"] =>
    tone === "success" || tone === "danger" ? tone : "default";

  const source: UiAction[] =
    ws && Array.isArray(ws.allowed_actions)
      ? ws.allowed_actions.map((action) => ({
          id: action.id,
          label: action.label,
          tone: toTone(action.tone),
          needsReason: Boolean(action.needs_reason),
          description: action.description ?? undefined,
        }))
      : gymAllowedActions(gym).map((action) => ({
          id: action.id,
          label: action.label,
          tone: toTone(action.tone),
          needsReason: Boolean(action.needsReason),
          description: action.description,
        }));

  const verified = (gym.verification_status ?? "").toLowerCase() === "verified";
  const activeVerified = (gym.status ?? "").toLowerCase() === "active" && verified;

  return source
    .filter((action) => action.id !== "edit" && action.id !== "transfer_ownership")
    .filter((action) => {
      // Never offer Approve / Approve & verify when verification is already complete.
      if (action.id === "approve_listing" && (verified || activeVerified)) return false;
      if (
        (verified || activeVerified) &&
        !action.id.startsWith("feature") &&
        /^approve(\b|$)/i.test(action.label)
      ) {
        return false;
      }
      return true;
    })
    .map((action) => {
      if (action.id === "feature_approve") return { ...action, label: "Approve featuring" };
      if (action.id === "feature_reject") return { ...action, label: "Reject featuring" };
      return action;
    });
}

function actionConsequence(action: UiAction, gym: GymRow, ws: GymWorkspace | null) {
  switch (action.id) {
    case "approve_listing":
      return "Listing becomes active and verification is marked verified.";
    case "mark_under_review":
      return "Verification moves to Under review. Listing visibility does not change.";
    case "revoke_verification":
      return "Verification returns to Pending. The reason is stored in the gym history.";
    case "activate_listing":
      return "Listing becomes active. Verification status is not changed.";
    case "deactivate_listing":
      return "Listing becomes inactive and is hidden from the app. Members, plans and payment history are kept.";
    case "reject_listing":
      return "Listing and verification are both set to Rejected.";
    case "delete_gym":
      return "Gym is soft-deleted (status deleted), hidden from the app. Payments and memberships are kept.";
    case "suspend":
      return `Listing becomes inactive and verification is suspended. ${
        ws?.suspension_policy?.note ?? ws?.readiness?.suspension_policy?.note ?? ""
      }`.trim();
    case "reactivate":
      return "Listing becomes active and verification returns to Verified.";
    case "feature_approve":
      return "Approves the featuring request. Listing and verification are not changed.";
    case "feature_reject":
      return "Rejects the featuring request. The gym stays listed but is not featured.";
    case "feature_toggle":
      return gym.is_featured
        ? "Removes the gym from featured placements."
        : "Marks the gym as featured.";
    default:
      return action.description ?? "";
  }
}

const EVENT_STATE_LABELS: Record<string, string> = {
  status: "Listing",
  verification_status: "Verification",
  feature_status: "Featuring",
  is_featured: "Featured",
  owner_user_id: "Owner",
};

function eventChanges(event: GymAdminEvent) {
  const prev = event.previous_state ?? {};
  const next = event.new_state ?? {};
  const changes: string[] = [];
  for (const key of Object.keys(EVENT_STATE_LABELS)) {
    if (!(key in next) && !(key in prev)) continue;
    const a = prev[key];
    const b = next[key];
    if (a === b) continue;
    if (key === "owner_user_id") {
      changes.push("Owner reassigned");
      continue;
    }
    const show = (value: unknown) =>
      value === null || value === undefined || value === ""
        ? "-"
        : formatStatusLabel(String(value));
    changes.push(`${EVENT_STATE_LABELS[key]}: ${show(a)} → ${show(b)}`);
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Presentational building blocks
// ---------------------------------------------------------------------------

function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5 shadow-sm", className)}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-heading text-sm font-semibold text-text-primary">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-xs text-text-secondary">{description}</p>
            ) : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-hint">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 truncate text-2xl font-bold tabular-nums",
          muted ? "text-text-hint" : "text-text-primary",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-text-secondary">{hint}</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-text-primary">
        {children}
      </dd>
    </div>
  );
}

function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "success";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-xs",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-900",
      )}
    >
      {children}
    </div>
  );
}

function SubNavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-text-secondary hover:bg-muted hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  error,
  disabled,
  onConfirm,
  onCancel,
  stacked,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  stacked?: boolean;
}) {
  return (
    <AdminModal
      open={open}
      title={title}
      stacked={stacked}
      onClose={() => {
        if (!busy) onCancel();
      }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={onConfirm}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-50",
              danger
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-text-primary">
        {children}
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </AdminModal>
  );
}

function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-text-secondary">
      <span>
        Page {page} of {pages} · {total.toLocaleString("en-ET")} members
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={btnSecondary}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className={btnSecondary}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function ImageField({
  label,
  previewUrl,
  inputRef,
  disabled,
  uploading,
  onPick,
  onRemoveRemote,
}: {
  label: string;
  previewUrl: string;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  uploading?: boolean;
  onPick: (file: File) => void;
  onRemoveRemote?: () => void | Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text-primary">{label}</p>
      <div className="flex items-start gap-3">
        <div className="h-24 w-36 overflow-hidden rounded-lg border border-border bg-muted">
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
            className={btnSecondary}
          >
            {uploading ? "Working…" : previewUrl ? "Replace" : "Upload"}
          </button>
          {previewUrl && onRemoveRemote ? (
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
      <p className="text-xs text-text-hint">JPG, PNG, WebP or GIF · up to 5 MB.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function GymDetailPage() {
  return (
    <Suspense fallback={<AdminLoadingRow label="Loading gym…" />}>
      <GymWorkspaceView />
    </Suspense>
  );
}

function GymWorkspaceView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = can("gyms:write");

  const route = parseRoute(searchParams);
  const memberParam = searchParams.get("member");
  const editParam = searchParams.get("edit") === "1";

  const [ws, setWs] = useState<GymWorkspace | null>(null);
  const [fallbackGym, setFallbackGym] = useState<GymRow | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<GymCategoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<UiAction | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [profileDirty, setProfileDirty] = useState(false);

  const notify = useMemo<Notify>(
    () => ({
      success: (message) => {
        setError(null);
        setNotice(message);
      },
      error: (message) => {
        setNotice(null);
        setError(message);
      },
    }),
    [],
  );

  type GymDetailSnapshot = {
    ws: GymWorkspace | null;
    fallbackGym: GymRow | null;
    wsError: string | null;
    catalog: GymCategoryRow[];
  };

  const {
    data: snapshot,
    loading,
    error: loadError,
    refresh,
  } = useAdminQuery<GymDetailSnapshot>({
    key: adminCacheKey(["gyms", "detail", id]),
    fetcher: async () => {
      const categoriesPromise = getSpojexClient()
        .from("gym_categories")
        .select("*")
        .order("sort_order");

      const res = await adminFetch(`/api/admin/gyms/${id}/workspace`);
      const payload = await readJson<Partial<GymWorkspace>>(res);
      let nextWs: GymWorkspace | null = null;
      let nextFallback: GymRow | null = null;
      let nextWsError: string | null = null;

      if (res.ok && payload.data) {
        nextWs = payload as GymWorkspace;
          } else {
        const reason = payload.error || "Workspace summary unavailable";
        const fb = await adminFetch(`/api/admin/gyms/${id}`);
        const fbPayload = await readJson<{ data?: GymRow }>(fb);
        if (!fb.ok || !fbPayload.data) {
          throw new Error(fbPayload.error || reason);
        }
        nextFallback = fbPayload.data;
        nextWsError = reason;
      }

      const categoriesRes = await categoriesPromise;
      const nextCatalog =
        !categoriesRes.error && (categoriesRes.data?.length ?? 0) > 0
          ? (categoriesRes.data as GymCategoryRow[])
          : gymCategories.map((item) => ({
              id: item.id,
              slug: item.id,
              label: item.label,
              emoji: item.emoji ?? "",
              sort_order: 0,
            }));

      return {
        ws: nextWs,
        fallbackGym: nextFallback,
        wsError: nextWsError,
        catalog: nextCatalog,
      };
    },
  });

  useApplyAdminSnapshot(snapshot, (snap) => {
    setWs(snap.ws);
    setFallbackGym(snap.fallbackGym);
    setWsError(snap.wsError);
    setCatalog(snap.catalog);
  });

  useEffect(() => {
    if (loadError) setError(loadError);
  }, [loadError]);

  const reload = useCallback(async () => {
    try {
      invalidateAdminCache(adminCacheKey(["gyms", "list"]));
      const next = await refresh();
      if (!next) throw new Error("Failed to refresh gym");
    } catch (err) {
      setError(errorMessage(err, "Failed to refresh gym"));
    }
  }, [refresh]);

  // Unsaved-profile protection for hard navigation (refresh / close tab).
  useEffect(() => {
    if (!profileDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [profileDirty]);

  const confirmLeave = useCallback(() => {
    if (!profileDirty) return true;
    const leave = window.confirm("You have unsaved profile changes. Discard them?");
    if (leave) setProfileDirty(false);
    return leave;
  }, [profileDirty]);

  const setDirty = setProfileDirty;

  const navigate = useCallback<Navigate>(
    (next) => {
      if (!confirmLeave()) return;
      const params = new URLSearchParams();
      params.set("tab", next.tab);
      if (next.tab === "members") params.set("view", next.view ?? "members");
      if (next.tab === "settings") params.set("section", next.section ?? "profile");
      if (next.edit) params.set("edit", "1");
      setNotice(null);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [confirmLeave, pathname, router],
  );

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const gym = ws?.data ?? fallbackGym;
  const actions = useMemo(() => (gym ? resolveActions(ws, gym) : []), [ws, gym]);

  const runAction = async () => {
    if (!pendingAction || !gym) return;
    const reason = actionReason.trim();
    if (pendingAction.needsReason && !reason) {
      setActionError("A reason is required for this action.");
      return;
    }
    setActionBusy(true);
    setActionError(null);
    try {
      await patchAdmin(`/api/admin/gyms/${id}`, {
        action: pendingAction.id,
        ...(reason ? { reason } : {}),
        idempotency_key: `${id}:${pendingAction.id}:${Date.now()}`,
      });
      notify.success(`${pendingAction.label} applied.`);
      setPendingAction(null);
      setActionReason("");
      await reload();
    } catch (err) {
      setActionError(errorMessage(err, "Action failed"));
    } finally {
      setActionBusy(false);
    }
  };

  if (loading && !ws && !fallbackGym) return <AdminLoadingRow label="Loading gym…" />;
  if (!gym) return <AdminErrorAlert message={error || "Gym not found"} />;

  const ownerName =
    gym.owner?.display_name || gym.owner_name || gym.users?.display_name || null;
  const ownerId = gym.owner?.user_id || gym.owner_user_id || null;
  const orgHref = ws?.organization?.href ?? null;
  const categoryText =
    gym.category_display?.trim() || gymCategoryLabel(gym.category, catalog);
  const locationText =
    gym.location_display?.trim() || locationLabel(gym.city, gym.country);
  const thumb = gym.logo_url?.trim() || gym.cover_url?.trim() || "";

  const menuItems: AdminRowMenuItem[] = [];
  if (canWrite) {
    menuItems.push({
      id: "edit",
      label: "Edit profile",
      onClick: () => navigate({ tab: "settings", section: "profile", edit: true }),
    });
    actions.forEach((action, index) => {
      menuItems.push({
        id: action.id,
        label: action.label,
        tone: action.tone,
        separatorBefore: index === 0,
        onClick: () => {
          setPendingAction(action);
          setActionReason("");
          setActionError(null);
        },
      });
    });
    menuItems.push({
      id: "transfer_ownership",
      label: "Transfer ownership",
      separatorBefore: true,
      onClick: () => navigate({ tab: "settings", section: "ownership" }),
    });
  }
  if (ownerId) {
    menuItems.push({
      id: "owner",
      label: "View owner profile",
      href: `/admin/users/${ownerId}`,
      separatorBefore: menuItems.length > 0,
    });
  }
  if (orgHref) {
    menuItems.push({ id: "org", label: "Open organization", href: orgHref });
  }

  const pendingActionText = pendingAction ? actionConsequence(pendingAction, gym, ws) : "";

  return (
    <>
      <AdminPageHeader
        title={gym.name || "Gym"}
        backHref="/admin/gyms"
        stackOnSmall
        breadcrumbs={[
          { label: "Gyms", href: "/admin/gyms" },
          { label: gym.name || "Detail" },
        ]}
        actions={
          menuItems.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-secondary">Actions</span>
              <AdminRowMenu items={menuItems} aria-label="Gym actions" />
            </div>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={gym.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-bold text-text-secondary">
              {(gym.name || "G").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{categoryText}</span>
            {locationText && locationText !== "-" ? ` · ${locationText}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={gymListingTone(gym.status)}>
              Listing: {gymStatusLabel(gym.status)}
            </StatusBadge>
            <StatusBadge tone={gymVerificationTone(gym.verification_status)}>
              {gymVerificationLabel(gym.verification_status)}
            </StatusBadge>
            <StatusBadge tone={gymFeatureTone(gym.feature_status, gym.is_featured)}>
              {gymFeatureLabel(gym.feature_status, gym.is_featured)}
            </StatusBadge>
          </div>
        </div>
        <div className="flex flex-col gap-1 text-sm sm:items-end">
          {ownerId ? (
            <Link href={`/admin/users/${ownerId}`} className="font-medium text-primary hover:underline">
              Owner: {ownerName || "View profile"}
            </Link>
          ) : (
            <span className="text-text-secondary">No owner assigned</span>
          )}
          {orgHref ? (
            <Link href={orgHref} className="text-primary hover:underline">
              {ws?.organization?.name || "Organization"}
            </Link>
          ) : (
            <span className="text-xs text-text-hint">No linked organization</span>
          )}
        </div>
      </div>

      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {wsError ? (
        <div className="mb-4">
          <Notice tone="warning">
            Workspace summary unavailable ({wsError}). Showing basic gym data - metrics that
            need the workspace API are marked unavailable.
          </Notice>
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => (
              <button
            key={item.id}
                type="button"
            onClick={() => navigate({ tab: item.id })}
            className={cn(
              "px-4 py-2.5 text-sm font-medium",
              route.tab === item.id
                ? "border-b-2 border-primary text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {item.label}
              </button>
        ))}
      </div>

      {route.tab === "overview" ? (
        <OverviewTab gym={gym} ws={ws} catalog={catalog} navigate={navigate} />
      ) : null}
      {route.tab === "members" ? (
        <MembersTab
          id={id}
          canWrite={canWrite}
          view={route.view}
          navigate={navigate}
          notify={notify}
          onChanged={reload}
          urlMemberId={memberParam}
          clearMemberParam={() => patchParams({ member: null })}
        />
      ) : null}
      {route.tab === "community" ? (
        <CommunityTab
          id={id}
          gym={gym}
          canWrite={canWrite}
          notify={notify}
          onChanged={reload}
          navigate={navigate}
        />
      ) : null}
      {route.tab === "finance" ? <FinanceTab id={id} gym={gym} ws={ws} /> : null}
      {route.tab === "settings" ? (
        <SettingsTab
          id={id}
          gym={gym}
          ws={ws}
          catalog={catalog}
          canWrite={canWrite}
          section={route.section}
          startEditing={editParam}
          clearEditParam={() => patchParams({ edit: null })}
          navigate={navigate}
          notify={notify}
          reload={reload}
          setDirty={setDirty}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.label ?? "Confirm action"}
        confirmLabel={pendingAction?.label ?? "Confirm"}
        danger={pendingAction?.tone === "danger"}
        busy={actionBusy}
        error={actionError}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void runAction()}
      >
        <p>
          <span className="font-medium">{gym.name}</span>
        </p>
        {pendingActionText ? (
          <p className="text-text-secondary">{pendingActionText}</p>
        ) : null}
        {pendingAction?.needsReason ? (
          <label className="grid gap-1">
            <span className="text-xs font-medium text-text-secondary">Reason (required)</span>
            <textarea
              rows={3}
              className={areaClass}
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
              placeholder="Recorded in gym history"
            />
          </label>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({
  gym,
  ws,
  catalog,
  navigate,
}: {
  gym: GymRow;
  ws: GymWorkspace | null;
  catalog: GymCategoryRow[];
  navigate: Navigate;
}) {
  const ov = ws?.overview ?? null;
  const period = ov?.period ?? null;
  const periodCurrency = period?.currency || "ETB";
  const lifetime = ws?.finance?.customer_memberships ?? null;
  const issues = ov?.config_issues ?? ws?.readiness?.issues ?? null;
  const community = ws?.community_summary ?? null;
  const events = (ws?.recent_events ?? []).slice(0, 5);
  const unavailable = !ws;
  const ratingAvg = gymNum(gym.rating_avg);
  const ratingCount = gymNum(gym.rating_count);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <section className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Paid active memberships"
            value={unavailable ? "Unavailable" : gymMetricLabel(ov?.paid_active_memberships)}
            hint="Active, unexpired plan memberships"
            muted={unavailable}
          />
          <MetricCard
            label="Community members"
            value={unavailable ? "Unavailable" : gymMetricLabel(ov?.community_members)}
            hint={
              gymNum(ov?.community_total) !== null
                ? `of ${gymMetricLabel(ov?.community_total)} on roster · not proof of paid access`
                : "Active roster entries · not proof of paid access"
            }
            muted={unavailable}
          />
          <MetricCard
            label="Expiring soon"
            value={unavailable ? "Unavailable" : gymMetricLabel(ov?.expiring_soon_14d)}
            hint="Active memberships ending within 14 days"
            muted={unavailable}
          />
          <MetricCard
            label="Verified collections"
            value={
              unavailable ? "Unavailable" : money(period?.verified_collections, periodCurrency)
            }
            hint={period?.label ?? "Period unavailable"}
            muted={unavailable}
          />
        </section>

        {period ? (
          <Card
            title="Collections snapshot"
            description={period.note}
            actions={
              <button
                type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => navigate({ tab: "finance" })}
              >
                Open Finance
              </button>
            }
          >
            <dl className="grid gap-3 sm:grid-cols-3">
              <Field label="Platform commission">
                {money(period.platform_commission, periodCurrency)}
              </Field>
              <Field label="Gym net">{money(period.gym_net, periodCurrency)}</Field>
              <Field label="Lifetime verified">
                {lifetime ? money(lifetime.verified_gross, lifetime.currency || "ETB") : "Unavailable"}
              </Field>
            </dl>
          </Card>
        ) : null}

        <Card
          title="Profile snapshot"
          actions={
              <button
                type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => navigate({ tab: "settings", section: "profile" })}
            >
              Open settings
              </button>
          }
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              {gym.category_display?.trim() || gymCategoryLabel(gym.category, catalog)}
            </Field>
            <Field label="Location">
              {gym.location_display?.trim() || locationLabel(gym.city, gym.country)}
            </Field>
            <Field label="Phone">{gym.contact_phone || "-"}</Field>
            <Field label="Email">{gym.contact_email || "-"}</Field>
            <Field label="Rating">{gymRatingLabel(ratingAvg, ratingCount)}</Field>
            <Field label="Followers">
              {gymMetricLabel(ov?.followers ?? gym.follower_count)}
            </Field>
            <Field label="Monthly platform fee">
              {gymPlatformFeeLabel(gymNum(gym.monthly_payment))}
            </Field>
            <Field label="Commission per transaction">
              {gymNum(gym.commission_pct) === null ? "-" : `${gymNum(gym.commission_pct)}%`}
            </Field>
            <Field label="Created">{formatDate(gym.created_at)}</Field>
            <Field label="Updated">{gym.updated_at ? formatDate(gym.updated_at) : "-"}</Field>
          </dl>
          {gym.description?.trim() ? (
            <p className="mt-4 border-t border-border pt-4 text-sm text-text-secondary">
              {gym.description}
            </p>
          ) : null}
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <Card title="Pending memberships">
          <p className="text-2xl font-bold tabular-nums text-text-primary">
            {unavailable ? "Unavailable" : gymMetricLabel(ov?.pending_memberships)}
          </p>
          <p className="mt-1 text-xs text-text-secondary">Awaiting payment confirmation</p>
                <button
                  type="button"
            className="mt-3 text-sm font-medium text-primary hover:underline"
            onClick={() => navigate({ tab: "members", view: "members" })}
                >
            Review members
                </button>
        </Card>

        <Card title="Configuration issues">
          {issues === null ? (
            <p className="text-sm text-text-hint">Unavailable</p>
          ) : issues.length === 0 ? (
            <p className="text-sm text-emerald-700">No configuration issues detected.</p>
          ) : (
            <ul className="space-y-2">
              {issues.map((issue) => (
                <li key={issue} className="flex items-start gap-2 text-sm text-text-primary">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {issue}
                </li>
              ))}
            </ul>
          )}
          {ws?.readiness?.label ? (
            <p className="mt-3 text-xs text-text-secondary">Readiness: {ws.readiness.label}</p>
          ) : null}
        </Card>

        <Card
          title="Community"
          actions={
                <button
                  type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => navigate({ tab: "community" })}
                >
              Inspect
                </button>
          }
        >
          {!community ? (
            <p className="text-sm text-text-hint">Unavailable</p>
          ) : !community.linked ? (
            <p className="text-sm text-text-secondary">
              {community.note || "No linked organization chat."}
            </p>
          ) : (
            <dl className="space-y-2">
              <Field label="Room">
                {community.room_state ? formatStatusLabel(community.room_state) : "-"}
              </Field>
              <Field label="Participants">{gymMetricLabel(community.participant_count)}</Field>
              <Field label="Posting">{postingModeLabel(community.posting_mode)}</Field>
            </dl>
          )}
        </Card>

        <Card
          title="Recent admin events"
          actions={
            events.length > 0 ? (
                <button
                  type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => navigate({ tab: "settings", section: "history" })}
              >
                View all
                </button>
            ) : null
          }
        >
          {events.length === 0 ? (
            <p className="text-sm text-text-secondary">
              {ws ? "No admin events recorded." : "Unavailable"}
            </p>
          ) : (
            <ul className="space-y-3">
              {events.map((event) => {
                const changes = eventChanges(event);
                return (
                  <li key={event.id} className="text-sm">
                    <p className="font-medium text-text-primary">
                      {formatStatusLabel(event.action)}
                    </p>
                    {changes.length > 0 ? (
                      <p className="text-xs text-text-secondary">{changes.join(" · ")}</p>
              ) : null}
                    <p className="text-xs text-text-hint">
                      {formatDateTime(event.created_at)}
                      {event.actor_user_id ? (
                        <>
                          {" · "}
                          <Link
                            href={`/admin/users/${event.actor_user_id}`}
                            className="text-primary hover:underline"
                          >
                            Actor
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
            </div>
    </div>
  );
}

function postingModeLabel(mode?: string | null) {
  switch (mode) {
    case "announcement_only":
      return "Announcement only";
    case "members_can_post":
      return "Members can post";
    default:
      return mode ? formatStatusLabel(mode) : "-";
  }
}

// ---------------------------------------------------------------------------
// Members (roster + plans)
// ---------------------------------------------------------------------------

const ACCESS_FILTERS = [
  { id: "all", label: "All access" },
  { id: "paid", label: "Paid / complimentary" },
  { id: "community_only", label: "Community only" },
  { id: "pending", label: "Pending payment" },
  { id: "expired", label: "Expired" },
  { id: "inactive", label: "Inactive roster" },
] as const;

type MemberConfirm = {
  kind: "deactivate" | "activate" | "remove";
  member: GymDirectoryMember;
};

function memberConsequence(kind: MemberConfirm["kind"], member: GymDirectoryMember) {
  const access = member.entitlement?.access_type;
  const hasEntitlement =
    access === "paid_subscription" ||
    access === "complimentary" ||
    access === "pending_payment";
  if (kind === "activate") {
    return "Puts this person back on the active community roster. Membership and payment records are not changed.";
  }
  if (kind === "remove") {
    return "Unlinks this person from the gym roster. Payment and membership financial history is preserved.";
  }
  if (hasEntitlement) {
    return "Takes this person off the active community roster. Their membership record (plan, dates) and all payment history are kept and nothing is refunded.";
  }
  return "Marks this person inactive on the community roster. They have no paid membership, so no payments are affected.";
}

function MembersTab({
  id,
  canWrite,
  view,
  navigate,
  notify,
  onChanged,
  urlMemberId,
  clearMemberParam,
}: {
  id: string;
  canWrite: boolean;
  view: MembersView;
  navigate: Navigate;
  notify: Notify;
  onChanged: () => Promise<void>;
  urlMemberId: string | null;
  clearMemberParam: () => void;
}) {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [access, setAccess] = useState("all");
  const [planId, setPlanId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(40);

  const [drawerId, setDrawerId] = useState<string | null>(urlMemberId);
  const [confirm, setConfirm] = useState<MemberConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  type MembersListData = {
    rows: GymDirectoryMember[];
    total: number;
    page_size?: number;
  };

  const {
    data: membersData,
    loading,
    error: loadError,
    refresh: refreshMembers,
  } = useAdminQuery<MembersListData>({
    key:
      view === "members"
        ? adminCacheKey(["gyms", id, "members", q, access, planId, page])
        : null,
    enabled: view === "members",
    fetcher: async () => {
      const qs = new URLSearchParams();
      if (q) qs.set("q", q);
      if (access !== "all") qs.set("access", access);
      if (planId) qs.set("plan_id", planId);
      qs.set("page", String(page));
      const res = await adminFetch(`/api/admin/gyms/${id}/members?${qs.toString()}`);
      const payload = await readJson<{
        data?: GymDirectoryMember[];
        total?: number;
        page_size?: number;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(payload.error || "Failed to load members");
      return {
        rows: payload.data ?? [],
        total: Number(payload.total ?? 0),
        page_size: payload.page_size ? Number(payload.page_size) : undefined,
      };
    },
  });

  const rows = membersData?.rows ?? [];
  const total = membersData?.total ?? 0;
  useEffect(() => {
    if (membersData?.page_size) setPageSize(membersData.page_size);
  }, [membersData?.page_size]);

  const {
    data: plansData,
    loading: plansLoading,
    error: plansError,
    refresh: loadPlans,
  } = useAdminQuery<GymPlanRow[]>({
    key: adminCacheKey(["gyms", id, "plans"]),
    fetcher: async () => {
      const res = await adminFetch(`/api/admin/gyms/${id}/plans`);
      const payload = await readJson<{ data?: GymPlanRow[]; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error || "Failed to load plans");
      return payload.data ?? [];
    },
  });
  const plans = plansData ?? [];

  const closeDrawer = () => {
    setDrawerId(null);
    if (urlMemberId) clearMemberParam();
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    setConfirmError(null);
    const { kind, member } = confirm;
    try {
      if (kind === "remove") {
        await deleteAdmin(`/api/admin/gyms/${id}/members/${member.id}`);
      } else {
        await patchAdmin(`/api/admin/gyms/${id}/members/${member.id}`, {
          is_active: kind === "activate",
        });
      }
      notify.success(
        kind === "remove"
          ? "Member removed. Financial history was preserved."
          : kind === "activate"
            ? "Member activated."
            : "Member deactivated. Financial history was preserved.",
      );
      setConfirm(null);
      if (kind === "remove" && drawerId === member.id) closeDrawer();
      invalidateAdminCache(adminCacheKey(["gyms", id, "members"]));
      invalidateAdminCache(adminCacheKey(["gyms", id, "member-detail"]));
      await refreshMembers();
      void onChanged();
    } catch (err) {
      setConfirmError(errorMessage(err, "Member update failed"));
    } finally {
      setConfirmBusy(false);
    }
  };

  const requestConfirm = (kind: MemberConfirm["kind"], member: GymDirectoryMember) => {
    setConfirmError(null);
    setConfirm({ kind, member });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {(
            [
              { id: "members", label: "Members" },
              { id: "plans", label: `Plans${plansLoading ? "" : ` (${plans.length})`}` },
            ] as const
          ).map((item) => (
          <button
            key={item.id}
            type="button"
              onClick={() => navigate({ tab: "members", view: item.id })}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-sm font-medium",
                view === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-text-secondary hover:text-text-primary",
              )}
          >
            {item.label}
          </button>
        ))}
        </div>
        <p className="max-w-xl text-xs text-text-secondary">
          Community roster is separate from paid membership. An active roster entry is not proof of
          a paid plan.
        </p>
      </div>

      {view === "members" ? (
        <>
          <AdminFilterPanel>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <AdminSearchInput
                value={qInput}
                onChange={setQInput}
                placeholder="Search name, email, phone or member code"
              />
              <AdminSelect
                value={access}
                onChange={(value) => {
                  setAccess(value);
                  setPage(1);
                }}
              >
                {ACCESS_FILTERS.map((item) => (
                  <option key={item.id} value={item.id}>
                  {item.label}
                  </option>
                ))}
              </AdminSelect>
              <AdminSelect
                value={planId}
                onChange={(value) => {
                  setPlanId(value);
                  setPage(1);
                }}
              >
                <option value="">All plans</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title}
                  </option>
                ))}
              </AdminSelect>
            </div>
          </AdminFilterPanel>

          {loadError ? <AdminErrorAlert message={loadError} /> : null}

          {loading && rows.length === 0 ? (
            <AdminLoadingRow label="Loading members…" />
          ) : rows.length === 0 && !loadError ? (
            <AdminTableShell>
              <AdminEmpty
                title="No members found"
                description={
                  q || access !== "all" || planId
                    ? "Try clearing the search or filters."
                    : "People who join this gym appear here."
                }
              />
            </AdminTableShell>
          ) : rows.length > 0 ? (
            <AdminTableShell>
              <table className="min-w-full text-left text-sm">
                <thead className={theadClass}>
                  <tr>
                    <th className={thClass}>Member</th>
                    <th className={thClass}>Plan</th>
                    <th className={thClass}>Access</th>
                    <th className={thClass}>Payment</th>
                    <th className={thClass}>Dates</th>
                    <th className={thClass}>Roster</th>
                    <th className={cn(thClass, "w-12")}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const plan = gymMemberPlanLabel(row);
                    const accessType = row.entitlement?.access_type;
                    const items: AdminRowMenuItem[] = [
                      { id: "view", label: "View details", onClick: () => setDrawerId(row.id) },
                    ];
                    if (row.user_id) {
                      items.push({
                        id: "profile",
                        label: "Open SpoJex profile",
                        href: `/admin/users/${row.user_id}`,
                      });
                    }
                    if (canWrite) {
                      items.push({
                        id: "toggle",
                        label: row.is_active ? "Deactivate" : "Activate",
                        separatorBefore: true,
                        onClick: () =>
                          requestConfirm(row.is_active ? "deactivate" : "activate", row),
                      });
                      items.push({
                        id: "remove",
                        label: "Remove from gym",
                        tone: "danger",
                        onClick: () => requestConfirm("remove", row),
                      });
                    }
                    return (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="text-left font-medium text-primary hover:underline"
                            onClick={() => setDrawerId(row.id)}
                          >
                            {row.full_name}
                          </button>
                          <p className="text-xs text-text-secondary">
                            {row.email || row.user_email || row.phone || "No contact on file"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className={cn("font-medium", plan.rosterOnly && "text-text-secondary")}>
                            {plan.label}
                          </p>
                          {plan.rosterOnly ? (
                            <p className="mt-0.5 max-w-[14rem] text-xs text-text-hint">
                              {row.source_note ||
                                "Roster entry without a purchased plan - not a missing paid plan."}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={gymMemberAccessTone(accessType)}>
                            {gymMemberAccessLabel(accessType)}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-xs capitalize text-text-secondary">
                          {row.entitlement?.payment_state?.replace(/_/g, " ") || "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">
                          {row.current_membership
                            ? dateRange(
                                row.current_membership.start_date,
                                row.current_membership.end_date,
                              )
                            : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={row.is_active ? "success" : "neutral"}>
                            {row.is_active ? "Active" : "Inactive"}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <AdminRowMenu items={items} aria-label={`Actions for ${row.full_name}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
            </AdminTableShell>
          ) : null}
        </>
      ) : (
        <PlansView
          id={id}
          canWrite={canWrite}
          plans={plans}
          loading={plansLoading}
          loadError={plansError}
          notify={notify}
          onChanged={async () => {
            await loadPlans();
            await onChanged();
          }}
        />
      )}

      {drawerId ? (
        <MemberDrawer
          id={id}
          memberId={drawerId}
          canWrite={canWrite}
          onClose={closeDrawer}
          onRequestAction={requestConfirm}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        stacked
        title={
          confirm?.kind === "remove"
            ? "Remove member from gym"
            : confirm?.kind === "activate"
              ? "Activate member"
              : "Deactivate member"
        }
        confirmLabel={
          confirm?.kind === "remove"
            ? "Remove member"
            : confirm?.kind === "activate"
              ? "Activate"
              : "Deactivate"
        }
        danger={confirm?.kind !== "activate"}
        busy={confirmBusy}
        error={confirmError}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
      >
        {confirm ? (
          <>
            <p className="font-medium">{confirm.member.full_name}</p>
            <p className="text-text-secondary">{memberConsequence(confirm.kind, confirm.member)}</p>
          </>
        ) : null}
      </ConfirmDialog>
                  </div>
  );
}

function MemberDrawer({
  id,
  memberId,
  canWrite,
  onClose,
  onRequestAction,
}: {
  id: string;
  memberId: string;
  canWrite: boolean;
  onClose: () => void;
  onRequestAction: (kind: MemberConfirm["kind"], member: GymDirectoryMember) => void;
}) {
  const {
    data: detail,
    loading,
    error,
  } = useAdminQuery<GymMemberDetail>({
    key: adminCacheKey(["gyms", id, "member-detail", memberId]),
    fetcher: async () => {
      const res = await adminFetch(`/api/admin/gyms/${id}/members/${memberId}/detail`);
      const payload = await readJson<Partial<GymMemberDetail> & { error?: string }>(res);
      if (!res.ok || !payload.member) {
        throw new Error(payload.error || "Failed to load member");
      }
      return payload as GymMemberDetail;
    },
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const member = detail?.member;
  const entitlement = detail?.entitlement ?? member?.entitlement ?? null;
  const memberWithEntitlement = member ? { ...member, entitlement } : null;
  const plan = memberWithEntitlement ? gymMemberPlanLabel(memberWithEntitlement) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close member details"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Member details"
        className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-base font-semibold text-text-primary">
              {member?.full_name || "Member"}
            </h2>
            {member ? (
              <p className="truncate text-xs text-text-secondary">
                {member.email || member.user_email || member.phone || "No contact on file"}
              </p>
                ) : null}
              </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-lg leading-none text-text-secondary hover:bg-muted hover:text-text-primary"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {loading && !detail ? <AdminLoadingRow label="Loading member…" /> : null}
          {error ? <AdminErrorAlert message={error} /> : null}

          {detail && member && memberWithEntitlement && plan ? (
            <>
              <section className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={member.is_active ? "success" : "neutral"}>
                    Roster: {member.is_active ? "Active" : "Inactive"}
                    </StatusBadge>
                  <StatusBadge tone={gymMemberAccessTone(entitlement?.access_type)}>
                    {gymMemberAccessLabel(entitlement?.access_type)}
                    </StatusBadge>
                  </div>
                <dl className="space-y-2 pt-1">
                  <Field label="Plan">{plan.label}</Field>
                  <Field label="Payment state">
                    {entitlement?.payment_state?.replace(/_/g, " ") || "-"}
                  </Field>
                  <Field label="Entitlement">
                    {entitlement?.entitlement_status
                      ? formatStatusLabel(entitlement.entitlement_status)
                      : "-"}
                  </Field>
                  <Field label="Check-ins">
                    {detail.attendance?.supported === false
                      ? "Unavailable"
                      : gymMetricLabel(detail.attendance?.checkins)}
                  </Field>
                  <Field label="SpoJex profile">
                    {member.user_id ? (
                      <Link
                        href={`/admin/users/${member.user_id}`}
                          className="text-primary hover:underline"
                        >
                        {member.user_display_name || "View profile"}
                      </Link>
                    ) : (
                      "Not linked"
                    )}
                  </Field>
                  <Field label="Joined">{formatDate(member.created_at)}</Field>
                </dl>
                {plan.rosterOnly ? (
                  <Notice>
                    Roster entry with no purchased plan. This is a community member, not a missing
                    paid plan. Access codes are concealed in admin.
                  </Notice>
                ) : (
                  <p className="text-xs text-text-hint">Access codes are concealed in admin.</p>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Membership history</h3>
                {(detail.memberships ?? []).length === 0 ? (
                  <p className="text-sm text-text-secondary">No memberships purchased.</p>
                ) : (
                  <ul className="space-y-2">
                    {(detail.memberships ?? []).map((ms) => (
                      <li
                        key={ms.id}
                        className="rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {ms.purchased_plan_title || ms.current_plan_title || "Plan not recorded"}
                          </span>
                          <StatusBadge tone={membershipStatusTone(ms.status)}>
                            {formatStatusLabel(ms.status)}
                          </StatusBadge>
                  </div>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {dateRange(ms.start_date, ms.end_date)}
                          {gymNum(ms.purchased_price_amount) !== null
                            ? ` · ${moneyCell(ms.purchased_price_amount, ms.purchased_currency || "ETB")} at purchase`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Payments</h3>
                {(detail.payments ?? []).length === 0 ? (
                  <p className="text-sm text-text-secondary">No payments recorded.</p>
                ) : (
                  <ul className="space-y-2">
                    {(detail.payments ?? []).map((payment) => (
                      <li
                        key={payment.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium tabular-nums">
                            {moneyCell(payment.amount, payment.currency || "ETB")}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {formatDate(payment.paid_at || payment.created_at)}
                            {payment.payment_type
                              ? ` · ${formatStatusLabel(payment.payment_type)}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge tone={paymentTone(payment.status)}>
                            {formatStatusLabel(payment.status)}
                          </StatusBadge>
                        <Link
                            href={`/admin/finance/transactions?module=gym&q=${payment.id}`}
                            className="text-xs text-primary hover:underline"
                        >
                            Ledger
                        </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Community chat</h3>
                {detail.community?.org_member ? (
                  <p className="text-sm text-text-secondary">
                    Organization member ({formatStatusLabel(detail.community.org_member.member_role)}
                    , {formatStatusLabel(detail.community.org_member.status)}).
                  </p>
                ) : (
                  <p className="text-sm text-text-secondary">Not a member of the gym chat.</p>
                )}
                {detail.community?.note ? (
                  <p className="mt-1 text-xs text-text-hint">{detail.community.note}</p>
                ) : null}
              </section>

              <Notice>
                {detail.actions?.note ||
                  "Deactivating or removing never deletes payment or membership financial history."}
              </Notice>
            </>
          ) : null}
                  </div>

        {canWrite && memberWithEntitlement ? (
          <div className="space-y-2 border-t border-border px-5 py-4">
            <p className="text-xs text-text-secondary">
              {memberConsequence(
                member?.is_active ? "deactivate" : "activate",
                memberWithEntitlement,
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={member?.is_active ? btnDanger : btnPrimary}
                onClick={() =>
                  onRequestAction(
                    member?.is_active ? "deactivate" : "activate",
                    memberWithEntitlement,
                  )
                }
              >
                {member?.is_active ? "Deactivate member" : "Activate member"}
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => onRequestAction("remove", memberWithEntitlement)}
              >
                Remove from gym
              </button>
                  </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

type PlanDraft = {
  title: string;
  description: string;
  price_amount: string;
  currency: string;
  duration_months: string;
  is_active: boolean;
};

const emptyPlanDraft: PlanDraft = {
  title: "",
  description: "",
  price_amount: "0",
  currency: "ETB",
  duration_months: "1",
  is_active: true,
};

function PlansView({
  id,
  canWrite,
  plans,
  loading,
  loadError,
  notify,
  onChanged,
}: {
  id: string;
  canWrite: boolean;
  plans: GymPlanRow[];
  loading: boolean;
  loadError: string | null;
  notify: Notify;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GymPlanRow | null>(null);
  const [draft, setDraft] = useState<PlanDraft>(emptyPlanDraft);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: "deactivate" | "activate" | "remove";
    plan: GymPlanRow;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyPlanDraft);
    setModalError(null);
    setOpen(true);
  };

  const openEdit = (row: GymPlanRow) => {
    const months =
      row.duration_months && row.duration_months > 0
        ? row.duration_months
        : Math.max(1, Math.round((row.duration_days || 30) / 30));
    setEditing(row);
    setDraft({
      title: row.title ?? "",
      description: row.description ?? "",
      price_amount: String(gymNum(row.price_amount) ?? 0),
      currency: row.currency || "ETB",
      duration_months: String(months),
      is_active: row.is_active !== false,
    });
    setModalError(null);
    setOpen(true);
  };

  const save = async () => {
    const title = draft.title.trim();
    if (!title) {
      setModalError("Plan title is required");
      return;
    }
    const months = Math.max(1, Math.floor(Number(draft.duration_months) || 1));
    const price = Number(draft.price_amount);
    if (!Number.isFinite(price) || price < 0) {
      setModalError("Price must be 0 or more");
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      const body = {
        title,
        description: draft.description.trim(),
        price_amount: price,
        currency: draft.currency.trim() || "ETB",
        duration_months: months,
        is_active: draft.is_active,
      };
      if (editing) {
        await patchAdmin(`/api/admin/gyms/${id}/plans/${editing.id}`, body);
        notify.success("Membership plan updated.");
      } else {
        await postAdmin(`/api/admin/gyms/${id}/plans`, body);
        notify.success("Membership plan created.");
      }
      setOpen(false);
      await onChanged();
    } catch (err) {
      setModalError(errorMessage(err, "Could not save plan"));
    } finally {
      setSaving(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      if (confirm.kind === "remove") {
        await deleteAdmin(`/api/admin/gyms/${id}/plans/${confirm.plan.id}`);
        notify.success("Membership plan removed.");
      } else {
        await patchAdmin(`/api/admin/gyms/${id}/plans/${confirm.plan.id}`, {
          is_active: confirm.kind === "activate",
        });
        notify.success(confirm.kind === "activate" ? "Plan activated." : "Plan deactivated.");
      }
      setConfirm(null);
      await onChanged();
    } catch (err) {
      setConfirmError(errorMessage(err, "Could not update plan"));
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Packages members choose in the app. Duration in months sets when a subscription expires.
        </p>
        {canWrite ? (
          <button type="button" className={btnPrimary} onClick={openCreate}>
            Add plan
          </button>
        ) : null}
      </div>

      {loadError ? <AdminErrorAlert message={loadError} /> : null}
      {loading && plans.length === 0 ? <AdminLoadingRow label="Loading plans…" /> : null}

      {!loading && plans.length === 0 && !loadError ? (
        <AdminTableShell>
          <AdminEmpty
            title="No membership plans"
            description={
              canWrite
                ? "Add Monthly, Quarterly, or custom packages with a month length."
                : "Membership packages for this gym appear here."
            }
          />
        </AdminTableShell>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const price = gymNum(plan.price_amount);
          const active = plan.is_active !== false;
          const activeSubs = gymNum(plan.active_subscribers);
          const lifetimeSubs = gymNum(plan.lifetime_subscriptions);
          const items: AdminRowMenuItem[] = canWrite
            ? [
                { id: "edit", label: "Edit plan", onClick: () => openEdit(plan) },
                {
                  id: "toggle",
                  label: active ? "Deactivate" : "Activate",
                  onClick: () => {
                    setConfirmError(null);
                    setConfirm({ kind: active ? "deactivate" : "activate", plan });
                  },
                },
                {
                  id: "remove",
                  label: "Remove",
                  tone: "danger",
                  separatorBefore: true,
                  onClick: () => {
                    setConfirmError(null);
                    setConfirm({ kind: "remove", plan });
                  },
                },
              ]
            : [];
          return (
            <article
              key={plan.id}
              className={cn(
                "flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm",
                !active && "opacity-80",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-heading text-sm font-semibold text-text-primary">
                    {plan.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {gymPlanMonthsLabel(plan.duration_months, plan.duration_days)}
                  </p>
                  </div>
                {items.length > 0 ? (
                  <AdminRowMenu items={items} aria-label={`Actions for ${plan.title}`} />
                ) : null}
              </div>
              <p className="mt-4 text-2xl font-bold tabular-nums text-text-primary">
                {price === null ? "-" : formatMoney(price, plan.currency || "ETB")}
              </p>
              {price === 0 ? (
                <p className="text-xs text-text-hint">Free / complimentary plan</p>
              ) : null}
              {plan.description ? (
                <p className="mt-2 line-clamp-3 text-sm text-text-secondary">{plan.description}</p>
              ) : null}
              <dl className="mt-4 space-y-2 border-t border-border pt-3">
                <Field label="Currency">{plan.currency || "ETB"}</Field>
                <Field label="Visibility">
                  <StatusBadge tone={active ? "success" : "neutral"}>
                    {active ? "Visible in app" : "Hidden"}
                  </StatusBadge>
                </Field>
                <Field label="Active subscribers">
                  {activeSubs === null ? "-" : activeSubs.toLocaleString("en-ET")}
                </Field>
                <Field label="Lifetime subscriptions">
                  {lifetimeSubs === null ? "-" : lifetimeSubs.toLocaleString("en-ET")}
                </Field>
                </dl>
            </article>
          );
        })}
      </div>

      <AdminModal
        open={open}
        title={editing ? "Edit membership plan" : "Add membership plan"}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        footer={
          <AdminModalFooter
            onCancel={() => setOpen(false)}
            onSave={() => void save()}
            saving={saving}
            saveLabel={editing ? "Save plan" : "Create plan"}
          />
        }
      >
        <div className="space-y-4">
          {modalError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {modalError}
            </p>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Title</span>
            <input
              className={fieldClass}
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Monthly membership"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Description</span>
            <textarea
              className={areaClass}
              rows={2}
              value={draft.description}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, description: event.target.value }))
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
                value={draft.price_amount}
                        onChange={(event) =>
                  setDraft((prev) => ({ ...prev, price_amount: event.target.value }))
                }
              />
                    </label>
                    <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Currency</span>
              <input
                        className={fieldClass}
                value={draft.currency}
                        onChange={(event) =>
                  setDraft((prev) => ({ ...prev, currency: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="grid gap-1 text-sm">
            <span className="text-text-secondary">Duration (months)</span>
            <div className="flex flex-wrap gap-2">
              {MONTH_PRESETS.map((months) => (
                <button
                  key={months}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, duration_months: String(months) }))
                  }
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium",
                    draft.duration_months === String(months)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-text-secondary hover:bg-muted",
                  )}
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
              value={draft.duration_months}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, duration_months: event.target.value }))
              }
              placeholder="Custom months"
            />
            <p className="text-xs text-text-hint">
              Used by the API to set membership end date (calendar months from purchase).
              Changing a plan does not rewrite existing memberships.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, is_active: event.target.checked }))
              }
              className="h-4 w-4 rounded border-border"
            />
            <span>Active (visible in the app)</span>
                    </label>
                  </div>
      </AdminModal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.kind === "remove"
            ? "Remove plan"
            : confirm?.kind === "activate"
              ? "Activate plan"
              : "Deactivate plan"
        }
        confirmLabel={
          confirm?.kind === "remove"
            ? "Remove plan"
            : confirm?.kind === "activate"
              ? "Activate"
              : "Deactivate"
        }
        danger={confirm?.kind !== "activate"}
        busy={confirmBusy}
        error={confirmError}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
      >
        {confirm ? (
          <>
            <p className="font-medium">{confirm.plan.title}</p>
            <p className="text-text-secondary">
              {confirm.kind === "remove"
                ? "Removes the plan. If members already purchased it, it is deactivated instead so their history stays intact."
                : confirm.kind === "deactivate"
                  ? "Hides the plan from the app so no new purchases can start. Existing memberships and payment history are not changed."
                  : "Makes the plan visible in the app again so members can purchase it."}
            </p>
          </>
              ) : null}
      </ConfirmDialog>
            </div>
  );
}

// ---------------------------------------------------------------------------
// Community (inspect only)
// ---------------------------------------------------------------------------

function CommunityTab({
  id,
  gym,
  canWrite,
  notify,
  onChanged,
  navigate,
}: {
  id: string;
  gym: GymRow;
  canWrite: boolean;
  notify: Notify;
  onChanged: () => Promise<void>;
  navigate: Navigate;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const {
    data,
    loading,
    error,
    refresh: load,
  } = useAdminQuery<GymCommunity>({
    key: adminCacheKey(["gyms", id, "community"]),
    fetcher: async () => {
      // Read-only inspection: never joins, marks read, or sends messages.
      const res = await adminFetch(`/api/admin/gyms/${id}/community`);
      const payload = await readJson<GymCommunity & { error?: string }>(res);
      if (!res.ok) throw new Error(payload.error || "Failed to load community");
      return payload;
    },
  });

  const enableChat = async () => {
    setBusy(true);
    setConfirmError(null);
    try {
      await postAdminResponse(`/api/admin/gyms/${id}/ensure-org`, {});
      notify.success("Organization chat enabled for this gym.");
      setConfirmOpen(false);
      invalidateAdminCache(adminCacheKey(["gyms", id, "community"]));
      await load();
      await onChanged();
    } catch (err) {
      setConfirmError(errorMessage(err, "Could not enable gym chat"));
    } finally {
      setBusy(false);
    }
  };

  const linked = Boolean(data?.linked);
  const announcementOnly = data?.posting_mode === "announcement_only";
  const roomMissing =
    linked && data?.configuration_state === "organization_linked_without_group_conversation";
  const canEnable = canWrite && (!linked || roomMissing);

  return (
    <div className="space-y-5">
      <Notice>
        Inspection only. Opening this tab does not join the room, mark messages read, or send
        anything.
      </Notice>

      {loading && !data ? <AdminLoadingRow label="Loading community…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      {data && !linked ? (
        <Card>
          <AdminEmpty
            title="No gym chat room"
            description={
              data.note ||
              "This gym has no linked organization, so there is no canonical gym chat room."
            }
          />
          <div className="flex flex-col items-center gap-2 pb-4">
            {canEnable && gym.owner_user_id ? (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => {
                  setConfirmError(null);
                  setConfirmOpen(true);
                }}
              >
                Enable organization chat
              </button>
            ) : canWrite && !gym.owner_user_id ? (
              <button
                type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => navigate({ tab: "settings", section: "ownership" })}
              >
                Assign an owner before enabling chat
              </button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {data && linked ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Room state"
              value={data.room_state ? formatStatusLabel(data.room_state) : "-"}
              hint={data.conversation?.last_message_at ? `Last activity ${formatDateTime(data.conversation.last_message_at)}` : undefined}
            />
            <MetricCard
              label="Participants"
              value={gymMetricLabel(data.participant_count)}
              hint="Members in the group conversation"
            />
            <MetricCard
              label="Posting mode"
              value={postingModeLabel(data.posting_mode)}
              hint={announcementOnly ? "Member composer hidden" : "Members can send messages"}
            />
            <MetricCard
              label="Pending join requests"
              value={gymMetricLabel(data.pending_join_requests)}
            />
              </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              title="Organization"
              actions={
                data.open_conversation_href ? (
                  <Link href={data.open_conversation_href} className={btnPrimary}>
                    Open conversation
                  </Link>
                ) : null
              }
            >
              <dl className="space-y-2">
                <Field label="Name">
                  {data.organization?.href ? (
                    <Link href={data.organization.href} className="text-primary hover:underline">
                      {data.organization.name || "Organization"}
                    </Link>
                  ) : (
                    data.organization?.name || "-"
                  )}
                </Field>
                <Field label="Active org members">
                  {gymMetricLabel(data.organization?.active_members)}
                </Field>
                <Field label="Configuration">
                  {data.configuration_state ? formatStatusLabel(data.configuration_state) : "-"}
                </Field>
              </dl>
              {roomMissing ? (
                <div className="mt-4 space-y-2">
                  <Notice tone="warning">
                    {data.note ||
                      "Organization is linked but no group conversation exists yet."}
                  </Notice>
                  {canEnable ? (
                <button
                  type="button"
                      className={btnSecondary}
                  onClick={() => {
                        setConfirmError(null);
                        setConfirmOpen(true);
                  }}
                >
                      Create chat room
                </button>
              ) : null}
            </div>
              ) : null}
            </Card>

            <Card title="Posting rules">
              {data.settings ? (
                <dl className="space-y-2">
                  <Field label="Who can post">
                    {data.settings.who_can_post
                      ? formatStatusLabel(data.settings.who_can_post)
                      : "-"}
                  </Field>
                  <Field label="Members can send">
                    {data.settings.allow_members_send === null ||
                    data.settings.allow_members_send === undefined
                      ? "-"
                      : data.settings.allow_members_send
                        ? "Yes"
                        : "No"}
                  </Field>
                  <Field label="Media">
                    {data.settings.allow_media === null || data.settings.allow_media === undefined
                      ? "-"
                      : data.settings.allow_media
                        ? "Allowed"
                        : "Not allowed"}
                  </Field>
                  <Field label="Reactions">
                    {data.settings.allow_reactions === null ||
                    data.settings.allow_reactions === undefined
                      ? "-"
                      : data.settings.allow_reactions
                        ? "Allowed"
                        : "Not allowed"}
                  </Field>
                  <Field label="Visibility">
                    {data.settings.group_visibility
                      ? formatStatusLabel(data.settings.group_visibility)
                      : "-"}
                  </Field>
                </dl>
              ) : (
                <p className="text-sm text-text-hint">Chat settings unavailable.</p>
              )}
              {announcementOnly ? (
                <p className="mt-3 text-xs text-text-secondary">
                  Announcement only: only owners, admins and moderators can send. Members do not
                  get a composer.
                </p>
                        ) : null}
            </Card>
          </div>

          {data.access_policy && Object.keys(data.access_policy).length > 0 ? (
            <Card title="Access policy">
              <ul className="space-y-3">
                {Object.entries(data.access_policy).map(([key, value]) => (
                  <li key={key} className="text-sm">
                    <p className="font-medium text-text-primary">{formatStatusLabel(key)}</p>
                    <p className="text-text-secondary">{value}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="space-y-1 text-xs text-text-hint">
            {data.reports?.available === false ? (
              <p>Reports: unavailable. {data.reports.note}</p>
            ) : null}
            {data.messages_note ? <p>{data.messages_note}</p> : null}
            {data.note ? <p>{data.note}</p> : null}
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Enable organization chat"
        confirmLabel="Enable chat"
        busy={busy}
        error={confirmError}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void enableChat()}
      >
        <p className="font-medium">{gym.name}</p>
        <p className="text-text-secondary">
          Creates or links the gym&apos;s organization and its group chat room. No messages are
          sent or read, and nobody is added automatically.
        </p>
      </ConfirmDialog>
                              </div>
  );
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

function FinanceTab({
  id,
  gym,
  ws,
}: {
  id: string;
  gym: GymRow;
  ws: GymWorkspace | null;
}) {
  const [days, setDays] = useState<number>(30);

  const {
    data,
    loading,
    error,
  } = useAdminQuery<GymFinance>({
    key: adminCacheKey(["gyms", id, "finance", days]),
    fetcher: async () => {
      const res = await adminFetch(`/api/admin/gyms/${id}/finance?days=${days}`);
      const payload = await readJson<GymFinance & { error?: string }>(res);
      if (!res.ok) throw new Error(payload.error || "Failed to load finance");
      return payload;
    },
  });

  const cc = data?.customer_collections ?? null;
  const currency = cc?.currency || "ETB";
  const unavailable = !cc;
  const configuredFee =
    data?.platform_subscription_fee?.configured_monthly ??
    ws?.finance?.platform_fee?.amount ??
    gym.monthly_payment;
  const settlement = data?.settlement ?? ws?.finance?.settlement ?? null;
  const payouts = data?.payouts ?? ws?.finance?.payouts ?? null;
  const transactions = data?.transactions ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs text-text-secondary">
          Customer membership payments (recorded at payment time) are separate from the
          Gym → Spojex monthly platform fee. Figures are never calculated as plan price × members.
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="gym-finance-range" className="text-sm text-text-secondary">
            Period
          </label>
          <AdminSelect
            value={String(days)}
            onChange={(value) => setDays(Number(value))}
            className="sm:w-auto"
          >
            {FINANCE_RANGES.map((range) => (
              <option key={range} value={range}>
                Last {range} days
                                  </option>
                                ))}
          </AdminSelect>
        </div>
      </div>

      {error ? <AdminErrorAlert message={error} /> : null}
      {loading && !data ? <AdminLoadingRow label="Loading finance…" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Verified collections"
          value={unavailable ? "Unavailable" : money(cc?.verified_gross, currency)}
          hint={
            cc ? `${gymMetricLabel(cc.verified_count)} verified payments` : data?.period?.label
          }
          muted={unavailable}
        />
        <MetricCard
          label="Refunds"
          value={unavailable ? "Unavailable" : money(cc?.refunds_amount, currency)}
          hint="Refunded / partially refunded payments"
          muted={unavailable}
        />
        <MetricCard
          label="Platform commission"
          value={unavailable ? "Unavailable" : money(cc?.platform_commission, currency)}
          hint="Per-transaction cut kept by Spojex"
          muted={unavailable}
        />
        <MetricCard
          label="Gym net"
          value={unavailable ? "Unavailable" : money(cc?.gym_net_earnings, currency)}
          hint="Collections minus commission snapshots"
          muted={unavailable}
        />
        <MetricCard
          label="Monthly platform fee"
          value={gymPlatformFeeLabel(gymNum(configuredFee))}
          hint={
            data?.platform_subscription_fee?.invoice_history_available === false
              ? "Configured fee · invoice history unavailable"
              : "Configured on the gym · distinct from collections"
          }
        />
        <MetricCard
          label="Settlement & payouts"
          value="Unavailable"
          hint={
            [settlement?.available === false ? settlement.note : null, payouts?.available === false ? payouts.note : null]
              .filter(Boolean)
              .join(" ") || "Not implemented for gyms yet"
          }
          muted
        />
                              </div>

      {cc?.note ? <p className="text-xs text-text-hint">{cc.note}</p> : null}

      {(data?.by_payment_type ?? []).length > 0 ? (
        <Card title="By payment type">
          <AdminTableShell>
            <table className="min-w-full text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Payments</th>
                  <th className={thClass}>Gross</th>
                  <th className={thClass}>Commission</th>
                  <th className={thClass}>Gym net</th>
                </tr>
              </thead>
              <tbody>
                {(data?.by_payment_type ?? []).map((row) => (
                  <tr key={row.payment_type} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{formatStatusLabel(row.payment_type)}</td>
                    <td className="px-4 py-3 tabular-nums">{gymMetricLabel(row.n)}</td>
                    <td className="px-4 py-3 tabular-nums">{moneyCell(row.amount, currency)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {moneyCell(row.commission, currency)}
                            </td>
                    <td className="px-4 py-3 tabular-nums">{moneyCell(row.gym_net, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </AdminTableShell>
        </Card>
      ) : null}

      <Card
        title="Transactions"
        description={data?.period?.label}
        actions={
          <Link
            href={`/admin/finance/transactions?module=gym&q=${gym.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Open Finance ledger
          </Link>
        }
      >
        {transactions.length === 0 ? (
              <AdminEmpty
            title="No transactions"
            description={
              error
                ? "Transactions are unavailable right now."
                : "No payments were recorded in this period."
            }
              />
            ) : (
              <AdminTableShell>
                  <table className="min-w-full text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>When</th>
                  <th className={thClass}>Member</th>
                  <th className={thClass}>Plan</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Gross</th>
                  <th className={thClass}>Commission</th>
                  <th className={thClass}>Gym net</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Links</th>
                      </tr>
                    </thead>
                    <tbody>
                {transactions.map((txn) => {
                  const cur = txn.currency || currency;
                        return (
                    <tr key={txn.id} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                        {formatDate(txn.paid_at || txn.created_at)}
                      </td>
                      <td className="px-4 py-3">{txn.member_name || "-"}</td>
                      <td className="px-4 py-3">{txn.plan_title || "-"}</td>
                            <td className="px-4 py-3">
                        {txn.payment_type ? formatStatusLabel(txn.payment_type) : "-"}
                            </td>
                      <td className="px-4 py-3 tabular-nums">{moneyCell(txn.amount, cur)}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {moneyCell(txn.commission_amount, cur)}
                            </td>
                      <td className="px-4 py-3 tabular-nums">
                        {moneyCell(txn.gym_net_amount, cur)}
                            </td>
                            <td className="px-4 py-3">
                        <StatusBadge tone={paymentTone(txn.status)}>
                          {formatStatusLabel(txn.status)}
                              </StatusBadge>
                            </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        <Link
                          href={txn.finance_href || `/admin/finance/transactions?module=gym&q=${txn.id}`}
                          className="text-primary hover:underline"
                        >
                          Ledger
                        </Link>
                        {txn.member_href ? (
                          <>
                            {" · "}
                            <Link href={txn.member_href} className="text-primary hover:underline">
                              Member
                            </Link>
                          </>
                            ) : null}
                      </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
              </AdminTableShell>
            )}
      </Card>

      {(data?.exclusions ?? []).length > 0 ? (
        <div className="text-xs text-text-hint">
          <p className="font-medium text-text-secondary">Not included</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {(data?.exclusions ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function SettingsTab({
  id,
  gym,
  ws,
  catalog,
  canWrite,
  section,
  startEditing,
  clearEditParam,
  navigate,
  notify,
  reload,
  setDirty,
}: {
  id: string;
  gym: GymRow;
  ws: GymWorkspace | null;
  catalog: GymCategoryRow[];
  canWrite: boolean;
  section: SettingsSection;
  startEditing: boolean;
  clearEditParam: () => void;
  navigate: Navigate;
  notify: Notify;
  reload: () => Promise<void>;
  setDirty: (dirty: boolean) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
      >
        {SETTINGS_SECTIONS.map((item) => (
          <SubNavButton
            key={item.id}
            active={section === item.id}
            onClick={() => navigate({ tab: "settings", section: item.id })}
          >
            {item.label}
          </SubNavButton>
        ))}
      </nav>

      <div className="min-w-0">
        {section === "profile" ? (
          <ProfileSection
            id={id}
            gym={gym}
            catalog={catalog}
            canWrite={canWrite}
            startEditing={startEditing}
            clearEditParam={clearEditParam}
            notify={notify}
            reload={reload}
            setDirty={setDirty}
          />
        ) : null}
        {section === "media" ? (
          <MediaSection id={id} gym={gym} canWrite={canWrite} notify={notify} reload={reload} />
        ) : null}
        {section === "staff" ? (
          <StaffSection id={id} ws={ws} canWrite={canWrite} notify={notify} />
        ) : null}
        {section === "ownership" ? (
          <OwnershipSection
            id={id}
            gym={gym}
            canWrite={canWrite}
            notify={notify}
            reload={reload}
          />
        ) : null}
        {section === "history" ? <HistorySection ws={ws} /> : null}
      </div>
    </div>
  );
}

type ProfileDraft = {
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
};

function draftFromGym(gym: GymRow): ProfileDraft {
  return {
    name: gym.name ?? "",
    category: gym.category || "gym",
    city: gym.city ?? "",
    country: gym.country ?? "ET",
    location: gym.location ?? "",
    address: gym.address ?? "",
    description: gym.description ?? "",
    contact_phone: gym.contact_phone ?? "",
    contact_email: gym.contact_email ?? "",
    website: gym.website ?? "",
    monthly_payment: String(gymNum(gym.monthly_payment) ?? 0),
  };
}

function ProfileSection({
  id,
  gym,
  catalog,
  canWrite,
  startEditing,
  clearEditParam,
  notify,
  reload,
  setDirty,
}: {
  id: string;
  gym: GymRow;
  catalog: GymCategoryRow[];
  canWrite: boolean;
  startEditing: boolean;
  clearEditParam: () => void;
  notify: Notify;
  reload: () => Promise<void>;
  setDirty: (dirty: boolean) => void;
}) {
  const baseline = useMemo(() => draftFromGym(gym), [gym]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(baseline);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(baseline);

  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);

  useEffect(() => () => setDirty(false), [setDirty]);

  useEffect(() => {
    if (startEditing && canWrite) {
      setDraft(baseline);
      setEditing(true);
    }
    // Only react to the explicit "edit" URL flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEditing, canWrite]);

  const beginEdit = () => {
    setDraft(baseline);
    setFormError(null);
    setEditing(true);
  };

  const cancel = () => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setEditing(false);
    setFormError(null);
    setDraft(baseline);
    if (startEditing) clearEditParam();
  };

  const save = async () => {
    const monthly = Number(draft.monthly_payment);
    if (!draft.name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (!Number.isFinite(monthly) || monthly < 0) {
      setFormError("Monthly platform fee must be a non-negative number");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await patchAdmin(`/api/admin/gyms/${id}`, {
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
      });
      setDirty(false);
      setEditing(false);
      if (startEditing) clearEditParam();
      notify.success("Gym details updated.");
      await reload();
    } catch (err) {
      setFormError(errorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = useMemo(() => {
    const options = catalog.map((item) => ({ slug: item.slug, label: item.label }));
    if (draft.category && !options.some((item) => item.slug === draft.category)) {
      options.unshift({
        slug: draft.category,
        label: gymCategoryLabel(draft.category, catalog),
      });
    }
    return options;
  }, [catalog, draft.category]);

  const set = (key: keyof ProfileDraft) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const readOnly = (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Field label="Name">{gym.name}</Field>
      <Field label="Slug">
        <span className="font-mono text-xs">{gym.slug || "-"}</span>
      </Field>
      <Field label="Category">
        {gym.category_display?.trim() || gymCategoryLabel(gym.category, catalog)}
      </Field>
      <Field label="Monthly platform fee">
        {gymPlatformFeeLabel(gymNum(gym.monthly_payment))}
      </Field>
      <Field label="City / country">{locationLabel(gym.city, gym.country)}</Field>
      <Field label="Area">{gym.location || "-"}</Field>
      <Field label="Address">{gym.address || "-"}</Field>
      <Field label="Phone">{gym.contact_phone || "-"}</Field>
      <Field label="Email">{gym.contact_email || "-"}</Field>
      <Field label="Website">
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
          "-"
        )}
      </Field>
      <Field label="Commission (read-only)">
        {gymNum(gym.commission_pct) === null ? "-" : `${gymNum(gym.commission_pct)}%`}
      </Field>
      <Field label="Listing">
        <StatusBadge tone={gymListingTone(gym.status)}>{gymStatusLabel(gym.status)}</StatusBadge>
      </Field>
      <Field label="Verification">
        <StatusBadge tone={gymVerificationTone(gym.verification_status)}>
          {gymVerificationLabel(gym.verification_status)}
        </StatusBadge>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description">{gym.description?.trim() || "-"}</Field>
      </div>
    </dl>
  );

  return (
    <Card
      title="Profile & location"
      description="Listing and verification are changed from the Actions menu so each change is audited."
      actions={
        canWrite && !editing ? (
          <button type="button" className={btnPrimary} onClick={beginEdit}>
            Edit
          </button>
        ) : editing ? (
          <div className="flex items-center gap-2">
            {dirty ? <span className="text-xs text-amber-700">Unsaved changes</span> : null}
            <button type="button" className={btnSecondary} disabled={saving} onClick={cancel}>
              Cancel
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={saving || !draft.name.trim()}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        ) : null
      }
    >
          {!canWrite ? (
        <p className="mb-4 text-xs text-text-secondary">You have read-only access.</p>
      ) : null}
      {formError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {formError}
        </p>
      ) : null}
      {!editing ? (
        readOnly
      ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-text-secondary">Name</span>
                  <input
                    className={fieldClass}
                    value={draft.name}
              onChange={(event) => set("name")(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Category</span>
                  <select
                    className={fieldClass}
                    value={draft.category}
              onChange={(event) => set("category")(event.target.value)}
                  >
              {categoryOptions.map((item) => (
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
              onChange={(event) => set("monthly_payment")(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-text-secondary">Description</span>
                  <textarea
                    rows={4}
                    className={areaClass}
                    value={draft.description}
              onChange={(event) => set("description")(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">City</span>
                  <input
                    className={fieldClass}
                    value={draft.city}
              onChange={(event) => set("city")(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Country</span>
                  <input
                    className={fieldClass}
                    value={draft.country}
              onChange={(event) => set("country")(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Area / neighborhood</span>
                  <input
                    className={fieldClass}
                    value={draft.location}
              onChange={(event) => set("location")(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Address</span>
                  <input
                    className={fieldClass}
                    value={draft.address}
              onChange={(event) => set("address")(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Phone</span>
                  <input
                    className={fieldClass}
                    value={draft.contact_phone}
              onChange={(event) => set("contact_phone")(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Email</span>
                  <input
                    className={fieldClass}
                    value={draft.contact_email}
              onChange={(event) => set("contact_email")(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-text-secondary">Website</span>
                  <input
                    className={fieldClass}
                    value={draft.website}
              onChange={(event) => set("website")(event.target.value)}
                  />
                </label>
          <p className="text-xs text-text-hint sm:col-span-2">
            Commission is read-only. Listing and verification are changed from the header Actions
            menu.
          </p>
        </div>
      )}
    </Card>
  );
}

function MediaSection({
  id,
  gym,
  canWrite,
  notify,
  reload,
}: {
  id: string;
  gym: GymRow;
  canWrite: boolean;
  notify: Notify;
  reload: () => Promise<void>;
}) {
  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState<ImageKind | null>(null);

  const upload = async (kind: ImageKind, file: File) => {
    if (!canWrite) return;
    try {
      validateImageFile(file);
    } catch (err) {
      notify.error(errorMessage(err, "Invalid image"));
      return;
    }
    setWorking(kind);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const res = await adminFetch(`/api/admin/gyms/${id}/image`, { method: "POST", body });
      const payload = await readJson<object>(res);
      if (!res.ok) throw new Error(payload.error || "Upload failed");
      await reload();
      notify.success(`${kind === "logo" ? "Logo" : "Cover"} updated.`);
    } catch (err) {
      notify.error(errorMessage(err, "Upload failed"));
    } finally {
      setWorking(null);
      const ref = kind === "logo" ? logoRef : coverRef;
      if (ref.current) ref.current.value = "";
    }
  };

  const remove = async (kind: ImageKind) => {
    if (!canWrite) return;
    setWorking(kind);
    try {
      const res = await adminFetch(`/api/admin/gyms/${id}/image?kind=${kind}`, {
        method: "DELETE",
      });
      const payload = await readJson<object>(res);
      if (!res.ok) throw new Error(payload.error || "Remove failed");
      await reload();
      notify.success(`${kind === "logo" ? "Logo" : "Cover"} removed.`);
    } catch (err) {
      notify.error(errorMessage(err, "Remove failed"));
    } finally {
      setWorking(null);
    }
  };

  const logo = gym.logo_url?.trim() || "";
  const cover = gym.cover_url?.trim() || "";

  return (
    <Card title="Media" description="Logo and cover shown on the gym's public page.">
      {!canWrite ? (
        <p className="mb-4 text-xs text-text-secondary">You have read-only access.</p>
      ) : null}
      <div className="space-y-6">
        <div className="overflow-hidden rounded-xl border border-border bg-muted">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-40 w-full object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-text-secondary">
              No cover
            </div>
          )}
        </div>
        {canWrite ? (
          <div className="grid gap-6 sm:grid-cols-2">
            <ImageField
              label="Logo"
              previewUrl={logo}
              inputRef={logoRef}
              uploading={working === "logo"}
              disabled={working !== null}
              onPick={(file) => void upload("logo", file)}
              onRemoveRemote={logo ? () => remove("logo") : undefined}
            />
            <ImageField
              label="Cover"
              previewUrl={cover}
              inputRef={coverRef}
              uploading={working === "cover"}
              disabled={working !== null}
              onPick={(file) => void upload("cover", file)}
              onRemoveRemote={cover ? () => remove("cover") : undefined}
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function StaffSection({
  id,
  ws,
  canWrite,
  notify,
}: {
  id: string;
  ws: GymWorkspace | null;
  canWrite: boolean;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false);
  const [staffNotice, setStaffNotice] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [mode, setMode] = useState<"assign" | "invite">("assign");
  const [role, setRole] = useState("manager");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [removeTarget, setRemoveTarget] = useState<GymStaffRow | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const {
    data: staffData,
    loading,
    error: loadError,
    refresh: load,
  } = useAdminQuery<GymStaffRow[]>({
    key: adminCacheKey(["gyms", id, "staff"]),
    fetcher: async () => {
      const res = await adminFetch(`/api/admin/gyms/${id}/staff`);
      const payload = await readJson<{ data?: GymStaffRow[]; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error || "Failed to load staff");
      return payload.data ?? [];
    },
  });
  const staff = staffData ?? [];

  const add = async () => {
    const trimmed = email.trim().replace(/^@+/, "");
    if (!trimmed) {
      setModalError(
        mode === "invite"
          ? "Enter an email to invite."
          : "Enter a SpoJex username or email.",
      );
      return;
    }
    const inviting = mode === "invite";
    if (inviting && !trimmed.includes("@")) {
      setModalError("Invites require an email address.");
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      const payload = await postAdminResponse(`/api/admin/gyms/${id}/staff`, {
        lookup: trimmed,
        user_email: trimmed.includes("@") ? trimmed.toLowerCase() : undefined,
        username: trimmed.includes("@") ? undefined : trimmed.toLowerCase(),
        full_name: fullName.trim() || undefined,
        staff_role: role,
        is_active: true,
        create_if_missing: inviting,
        invite: inviting,
      });
      setOpen(false);
      setEmail("");
      setFullName("");
      setRole("manager");
      setMode("assign");
      setStaffNotice(
        typeof payload.message === "string"
          ? payload.message
          : "Staff assignment updated. Platform profile role was not changed.",
      );
      notify.success(inviting ? "Invitation sent." : "Staff member assigned.");
      invalidateAdminCache(adminCacheKey(["gyms", id, "staff"]));
      await load();
    } catch (err) {
      setModalError(errorMessage(err, "Add staff failed"));
    } finally {
      setSaving(false);
    }
  };

  const patch = async (row: GymStaffRow, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await patchAdmin(`/api/admin/gyms/${id}/staff/${row.id}`, body);
      notify.success("Staff updated.");
      invalidateAdminCache(adminCacheKey(["gyms", id, "staff"]));
      await load();
    } catch (err) {
      notify.error(errorMessage(err, "Staff update failed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    setRemoveError(null);
    try {
      await deleteAdmin(`/api/admin/gyms/${id}/staff/${removeTarget.id}`);
      notify.success("Staff removed.");
      setRemoveTarget(null);
      invalidateAdminCache(adminCacheKey(["gyms", id, "staff"]));
      await load();
    } catch (err) {
      setRemoveError(errorMessage(err, "Remove failed"));
    } finally {
      setBusy(false);
    }
  };

  const capabilityLabels = ws?.staff_capabilities ?? {};
  const roleCaps = ws?.role_default_capabilities ?? {};

  return (
    <div className="space-y-6">
      <Card
        title="Staff & access"
        description="Assign an existing Spojex user or invite a new one. Gym staff role is separate from their platform profile role - assigning staff never overwrites it. Passwords are never shown in admin."
        actions={
          canWrite ? (
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                setModalError(null);
                setMode("assign");
                setOpen(true);
              }}
            >
              Assign / invite staff
            </button>
          ) : null
        }
      >
        {staffNotice ? (
          <div className="mb-3">
            <Notice tone="success">{staffNotice}</Notice>
          </div>
        ) : null}
        {loadError ? <AdminErrorAlert message={loadError} /> : null}
        {loading ? (
          <AdminLoadingRow label="Loading staff…" />
        ) : staff.length === 0 && !loadError ? (
          <AdminEmpty
            title="No staff"
            description={
              canWrite
                ? "Add an owner or manager linked to a SpoJex user."
                : "Staff assignments appear here."
            }
          />
        ) : staff.length > 0 ? (
          <AdminTableShell>
            <table className="min-w-full text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>User</th>
                  <th className={thClass}>Role</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Added</th>
                  {canWrite ? (
                    <th className={cn(thClass, "w-12")}>
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {staff.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      {row.users ? (
                        <>
                          <Link
                            href={`/admin/users/${row.users.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {row.users.display_name || "User"}
                          </Link>
                          <p className="text-xs text-text-secondary">
                            {[
                              row.users.username
                                ? `@${row.users.username}`
                                : null,
                              row.users.email,
                              row.users.phone,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </>
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
                            void patch(row, { staff_role: event.target.value })
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
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                    {canWrite ? (
                      <td className="px-4 py-3 text-right">
                        <AdminRowMenu
                          disabled={busy}
                          aria-label="Staff actions"
                          items={[
                            {
                              id: "toggle",
                              label: row.is_active ? "Deactivate" : "Activate",
                              onClick: () => void patch(row, { is_active: !row.is_active }),
                            },
                            {
                              id: "remove",
                              label: "Remove",
                              tone: "danger",
                              separatorBefore: true,
                              onClick: () => {
                                setRemoveError(null);
                                setRemoveTarget(row);
                              },
                            },
                          ]}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableShell>
        ) : null}
      </Card>

      {Object.keys(roleCaps).length > 0 ? (
        <Card title="Default role capabilities">
          <ul className="space-y-2 text-sm">
            {Object.entries(roleCaps).map(([roleId, caps]) => (
              <li key={roleId} className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="w-28 shrink-0 font-medium text-text-primary">
                  {gymStaffRoleLabel(roleId)}
                </span>
                <span className="text-text-secondary">
                  {caps.map((cap) => capabilityLabels[cap] ?? formatStatusLabel(cap)).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <AdminModal
        open={open}
        title="Add gym staff"
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        footer={
          <AdminModalFooter
            onCancel={() => setOpen(false)}
            onSave={() => void add()}
            saving={saving}
            saveLabel={mode === "invite" ? "Send invite" : "Add staff"}
          />
        }
      >
        <div className="space-y-4">
          {modalError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {modalError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "assign", label: "Assign existing user" },
                { id: "invite", label: "Invite new staff" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  mode === item.id
                    ? "bg-primary text-primary-foreground"
                    : "border border-border",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Gym staff role</span>
            <select
              className={fieldClass}
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {gymStaffRoles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">
              {mode === "invite" ? "Spojex email" : "Username or email"}
            </span>
            <input
              className={fieldClass}
              type={mode === "invite" ? "email" : "text"}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={
                mode === "invite" ? "name@example.com" : "@username or name@example.com"
              }
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Display name (optional)</span>
            <input
              className={fieldClass}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Used on invite profile only"
            />
          </label>
          <p className="text-xs text-text-secondary">
            {mode === "assign"
              ? "Looks up an existing Spojex user by @username or email. Their platform profile role is left unchanged."
              : "Sends an Auth invitation / creates an activatable account. Passwords are never returned in admin responses."}
          </p>
        </div>
      </AdminModal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove staff member"
        confirmLabel="Remove"
        danger
        busy={busy}
        error={removeError}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void remove()}
      >
        <p className="font-medium">
          {removeTarget?.users?.display_name || removeTarget?.users?.email || "This staff member"}
        </p>
        <p className="text-text-secondary">
          Removes their gym staff access. Their SpoJex account and platform role are not changed.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function OwnershipSection({
  id,
  gym,
  canWrite,
  notify,
  reload,
}: {
  id: string;
  gym: GymRow;
  canWrite: boolean;
  notify: Notify;
  reload: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<OwnerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const ownerId = gym.owner?.user_id || gym.owner_user_id || "";
  const ownerName =
    gym.owner?.display_name || gym.owner_name || gym.users?.display_name || null;
  const ownerEmail = gym.owner?.email || gym.users?.email || gym.contact_email || null;

  useEffect(() => {
    if (!canWrite) return;
    const q = query.trim().replace(/[%(),]/g, " ");
    if (q.length < 2 || pendingId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      void adminFetch(`/api/admin/users?q=${encodeURIComponent(q)}&limit=12`)
        .then(async (res) => {
          const json = await readJson<{ data?: OwnerOption[] }>(res);
          if (cancelled) return;
          if (!res.ok) {
            setSearchError(json.error || "Failed to search users");
            setOptions([]);
          } else {
            setOptions(json.data ?? []);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setSearchError(errorMessage(err, "Failed to search users"));
          setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canWrite, query, pendingId]);

  const canApply = Boolean(pendingId) && pendingId !== ownerId && reason.trim().length > 0;

  const apply = async () => {
    setBusy(true);
    setConfirmError(null);
    try {
      await patchAdmin(`/api/admin/gyms/${id}`, {
        action: "transfer_ownership",
        owner_user_id: pendingId,
        reason: reason.trim(),
        idempotency_key: `${id}:transfer_ownership:${pendingId}:${Date.now()}`,
      });
      notify.success("Gym owner reassigned. Historical payments were not rewritten.");
      setConfirmOpen(false);
      setQuery("");
      setPendingId("");
      setPendingName("");
      setReason("");
      await reload();
    } catch (err) {
      setConfirmError(errorMessage(err, "Ownership transfer failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Current owner">
        <dl className="space-y-2">
          <Field label="Name">{ownerName || "-"}</Field>
          <Field label="Profile">
            {ownerId ? (
              <Link href={`/admin/users/${ownerId}`} className="text-primary hover:underline">
                View profile
              </Link>
            ) : (
              "No owner assigned"
            )}
          </Field>
          <Field label="Email">{ownerEmail || "-"}</Field>
          <Field label="Owner ID">
            <span className="font-mono text-xs">{ownerId || "-"}</span>
          </Field>
        </dl>
      </Card>

      <Card
        title="Transfer ownership"
        description="Moves gym ownership to another existing SpoJex user. Does not move personal balances or rewrite historical payment recipients."
      >
        {!canWrite ? (
          <p className="text-sm text-text-secondary">You have read-only access.</p>
        ) : (
          <div className="space-y-4">
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Proposed owner (search)</span>
              <input
                className={fieldClass}
                value={query}
                disabled={busy}
              onChange={(event) => {
                  setQuery(event.target.value);
                  setPendingId("");
                  setPendingName("");
                }}
                placeholder="Search by name or email"
              />
            </label>
            {pendingId ? (
              <p className="text-xs text-emerald-700">Proposed: {pendingName || pendingId}</p>
            ) : null}
            {searching ? <p className="text-xs text-text-hint">Searching…</p> : null}
            {searchError ? <p className="text-xs text-red-600">{searchError}</p> : null}
            {options.length > 0 ? (
              <ul className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
                {options.map((owner) => (
                  <li key={owner.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPendingId(owner.id);
                        setPendingName(owner.display_name || owner.email || "");
                        setQuery(owner.email || owner.display_name);
                        setOptions([]);
                      }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
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
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Reason (required)</span>
              <input
                className={fieldClass}
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is ownership changing?"
              />
          </label>
            <div className="flex justify-end">
              <button
                type="button"
                className={btnDanger}
                disabled={!canApply || busy}
                onClick={() => {
                  setConfirmError(null);
                  setConfirmOpen(true);
                }}
              >
                Transfer ownership
              </button>
        </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm ownership transfer"
        confirmLabel="Transfer ownership"
        danger
        busy={busy}
        error={confirmError}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void apply()}
      >
        <p>
          Transfer <span className="font-medium">{gym.name}</span> from{" "}
          <span className="font-medium">{ownerName || "no owner"}</span> to{" "}
          <span className="font-medium">{pendingName || pendingId}</span>?
        </p>
        <p className="text-text-secondary">
          Reason: {reason.trim() || "-"}. Historical payments and personal balances are not moved.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function HistorySection({ ws }: { ws: GymWorkspace | null }) {
  const events = ws?.recent_events ?? [];
  return (
    <Card
      title="Listing & verification history"
      description="Most recent admin events for this gym."
    >
      {!ws ? (
        <p className="text-sm text-text-hint">Unavailable - workspace summary could not be loaded.</p>
      ) : events.length === 0 ? (
        <AdminEmpty title="No history yet" description="Admin actions on this gym are recorded here." />
      ) : (
        <AdminTableShell>
          <table className="min-w-full text-left text-sm">
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>When</th>
                <th className={thClass}>Event</th>
                <th className={thClass}>Change</th>
                <th className={thClass}>Reason</th>
                <th className={thClass}>Actor</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const changes = eventChanges(event);
                return (
                  <tr key={event.id} className="border-b border-border align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                      {formatDateTime(event.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium">{formatStatusLabel(event.action)}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {changes.length > 0 ? changes.join(" · ") : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{event.reason || "-"}</td>
                    <td className="px-4 py-3 text-xs">
                      {event.actor_user_id ? (
                        <Link
                          href={`/admin/users/${event.actor_user_id}`}
                          className="text-primary hover:underline"
                        >
                          View actor
                        </Link>
                      ) : (
                        "System"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminTableShell>
      )}
    </Card>
  );
}
