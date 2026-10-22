"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import BeneficiarySelect from "@/components/beneficiary-select";
import { StatusBadge, requestTone } from "@/components/status-badge";
import {
  campaignAssetLabel,
  campaignIsCoin,
  campaignMedia,
  contributionPaymentLabel,
  donationLifecyclePolicy,
  donationStatusLabel,
  donationStatuses,
  formatDonationAmount,
  sanitizeDonorMessage,
} from "@/lib/donations";
import { adminFetch, deleteAdmin, patchAdmin, postAdminResponse } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { DonationCampaignRow, DonationContributionRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type ImageKind = "cover" | "image";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "contributions", label: "Contributions" },
  { id: "disbursements", label: "Disbursements" },
  { id: "settings", label: "Settings & Activity" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

type Workspace = {
  campaign: DonationCampaignRow & {
    beneficiary_display_name?: string | null;
  };
  media?: ReturnType<typeof campaignMedia>;
  asset?: string;
  progress?: {
    raised?: string;
    goal?: string;
    percent?: number;
    bar_percent?: number;
    label?: string;
    note?: string;
  };
  attribution?: {
    public_beneficiary_user_id?: string | null;
    public_beneficiary_name?: string | null;
    public_beneficiary_org?: { id?: string; name?: string; is_platform?: boolean } | null;
    credited_recipient_note?: string;
    redeem_authorized?: string;
  };
  aggregates?: {
    completed_count?: number;
    pending_count?: number;
    failed_count?: number;
    reversed_count?: number;
    unique_donors?: number;
    completed_coins?: string | number;
    completed_etb?: string | number;
  };
  recent_contributions?: DonationContributionRow[];
  activity?: Array<{
    id: string;
    action: string;
    reason?: string | null;
    created_at: string;
    actor_user_id?: string | null;
  }>;
  alerts?: string[];
  lifecycle_policy?: Record<string, unknown>;
  disbursements?: { supported?: boolean; message?: string };
  contribution_count?: number;
  asset_locked?: boolean;
};

type SettingsForm = {
  title: string;
  summary: string;
  description: string;
  currency: string;
  goal: string;
  beneficiary_user_id: string;
  status: string;
  sort_order: string;
  is_featured: boolean;
  reason: string;
};

function validateImageFile(file: File) {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (file.type && !allowed.has(file.type)) {
    throw new Error("Use a JPG, PNG, WebP, or GIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
}

async function uploadDonationImage(campaignId: string, file: File, kind: ImageKind) {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  const response = await adminFetch(`/api/admin/donations/${campaignId}/image`, {
    method: "POST",
    body,
  });
  const payload = (await response.json()) as {
    error?: string;
    cover_url?: string;
    image_url?: string;
  };
  if (!response.ok) throw new Error(payload.error || "Upload failed");
  return payload;
}

async function removeDonationImage(campaignId: string, kind: ImageKind) {
  const response = await adminFetch(
    `/api/admin/donations/${campaignId}/image?kind=${kind}`,
    { method: "DELETE" },
  );
  const payload = (await response.json()) as {
    error?: string;
    cover_url?: string;
    image_url?: string;
  };
  if (!response.ok) throw new Error(payload.error || "Remove failed");
  return payload;
}

function DonationImagePicker({
  label,
  hint,
  previewUrl,
  inputRef,
  disabled,
  uploading,
  onPick,
  onRemoveRemote,
}: {
  label: string;
  hint?: string;
  previewUrl: string;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  uploading?: boolean;
  onPick: (file: File) => void;
  onRemoveRemote?: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start gap-3">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
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
          <p className="text-xs text-text-secondary">
            {hint || "JPG, PNG, WebP, or GIF · up to 5 MB"}
          </p>
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
              {uploading
                ? "Uploading…"
                : previewUrl
                  ? `Replace ${label.toLowerCase()}`
                  : `Upload ${label.toLowerCase()}`}
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
      </div>
    </div>
  );
}

function formFromCampaign(c: DonationCampaignRow): SettingsForm {
  const coin = campaignIsCoin(c);
  return {
    title: c.title || "",
    summary: c.summary || "",
    description: c.description || "",
    currency: coin ? "COIN" : c.currency || "ETB",
    goal: String(coin ? c.goal_coins || c.goal_amount || 0 : c.goal_amount || 0),
    beneficiary_user_id: c.beneficiary_user_id || "",
    status: c.status || "draft",
    sort_order: String(c.sort_order ?? 0),
    is_featured: Boolean(c.is_featured),
    reason: "",
  };
}

export default function DonationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("donations:write");
  const canExport = can("donations:write") || can("finance:read");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<TabId>("overview");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploadingKind, setUploadingKind] = useState<ImageKind | null>(null);

  const [contribs, setContribs] = useState<DonationContributionRow[]>([]);
  const [contribTotal, setContribTotal] = useState(0);
  const [contribPage, setContribPage] = useState(1);
  const [contribQ, setContribQ] = useState("");
  const [contribStatus, setContribStatus] = useState("all");
  const [contribLoading, setContribLoading] = useState(false);

  const campaign = workspace?.campaign ?? null;

  const loadWorkspace = async () => {
    const res = await adminFetch(`/api/admin/donations/${id}/workspace`);
    const payload = (await res.json()) as Workspace & { error?: string };
    if (!res.ok) throw new Error(payload.error || "Failed to load workspace");
    setWorkspace(payload);
    if (!dirty) {
      setForm(formFromCampaign(payload.campaign));
      setEditing(false);
    }
  };

  const loadContributions = async () => {
    setContribLoading(true);
    try {
      const params = new URLSearchParams();
      if (contribQ.trim()) params.set("q", contribQ.trim());
      if (contribStatus !== "all") params.set("status", contribStatus);
      params.set("page", String(contribPage));
      params.set("page_size", "40");
      const res = await adminFetch(`/api/admin/donations/${id}/contributions?${params}`);
      const payload = (await res.json()) as {
        data?: DonationContributionRow[];
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Failed to load contributions");
      setContribs(payload.data ?? []);
      setContribTotal(payload.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contributions");
    } finally {
      setContribLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadWorkspace()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (tab === "contributions") void loadContributions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, contribPage, contribStatus]);

  useEffect(() => {
    if (tab !== "contributions") return;
    const t = window.setTimeout(() => {
      if (contribPage !== 1) setContribPage(1);
      else void loadContributions();
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contribQ]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const updateForm = (patch: Partial<SettingsForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
    setFieldErrors({});
  };

  const cancelEdit = () => {
    if (!campaign) return;
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setForm(formFromCampaign(campaign));
    setDirty(false);
    setEditing(false);
    setFieldErrors({});
    setError(null);
  };

  const validate = (): boolean => {
    if (!form) return false;
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Title is required";
    const goalNum = Number(form.goal);
    if (!(goalNum > 0)) next.goal = "Goal must be greater than 0";
    const needsReason =
      (campaign && form.status !== campaign.status && ["paused", "closed"].includes(form.status)) ||
      (campaign &&
        (form.beneficiary_user_id || "") !== (campaign.beneficiary_user_id || ""));
    if (needsReason && !form.reason.trim()) {
      next.reason = "Reason required for status or beneficiary changes";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveSettings = async () => {
    if (!canWrite || !form || !campaign) return;
    if (!validate()) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const isCoin = form.currency.toUpperCase() === "COIN" || form.currency.toUpperCase() === "COINS";
      const goalNum = Number(form.goal) || 0;
      const patch: Record<string, unknown> = {
        title: form.title.trim(),
        summary: form.summary,
        description: form.description,
        currency: isCoin ? "COIN" : "ETB",
        goal_amount: goalNum,
        goal_coins: isCoin ? goalNum : 0,
        beneficiary_user_id: form.beneficiary_user_id.trim() || null,
        status: form.status,
        sort_order: Number(form.sort_order) || 0,
        is_featured: form.is_featured,
        expected_updated_at: campaign.updated_at,
      };
      if (form.reason.trim()) patch.reason = form.reason.trim();

      await patchAdmin(`/api/admin/donations/${id}`, patch);
      setDirty(false);
      setEditing(false);
      setNotice("Campaign saved.");
      await loadWorkspace();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      if (/conflict|modified by someone else/i.test(message)) {
        setNotice("Reload the workspace, then re-apply your edits.");
      }
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: string) => {
    if (!canWrite) return;
    let reason: string | undefined;
    if (action === "pause" || action === "close") {
      reason = window.prompt(`Reason for ${action}:`) || undefined;
      if (!reason?.trim()) {
        setError("Reason required.");
        return;
      }
    }
    setError(null);
    setNotice(null);
    try {
      const payload = await postAdminResponse(`/api/admin/donations/${id}/actions`, {
        action,
        reason,
      });
      setNotice(payload.message || `Campaign ${action} applied.`);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Close or delete "${campaign?.title}"? History is preserved when contributions exist.`)) {
      return;
    }
    setError(null);
    try {
      await deleteAdmin(`/api/admin/donations/${id}`);
      router.replace("/admin/donations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const uploadImage = async (kind: ImageKind, file: File) => {
    setError(null);
    setNotice(null);
    try {
      validateImageFile(file);
      setUploadingKind(kind);
      await uploadDonationImage(id, file, kind);
      setNotice(kind === "cover" ? "Cover image uploaded." : "Thumbnail uploaded.");
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingKind(null);
      if (kind === "cover" && coverInputRef.current) coverInputRef.current.value = "";
      if (kind === "image" && thumbInputRef.current) thumbInputRef.current.value = "";
    }
  };

  const clearImage = async (kind: ImageKind) => {
    setError(null);
    setNotice(null);
    try {
      setUploadingKind(kind);
      await removeDonationImage(id, kind);
      setNotice(kind === "cover" ? "Cover image removed." : "Thumbnail removed.");
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploadingKind(null);
    }
  };

  if (loading) return <AdminLoadingRow label="Loading campaign…" />;
  if (!campaign || !form || !workspace) {
    return <AdminErrorAlert message={error || "Campaign not found"} />;
  }

  const media = workspace.media || campaignMedia(campaign);
  const isCoin = campaignIsCoin(campaign);
  const displayCurrency = isCoin ? "COIN" : campaign.currency || "ETB";
  const progress = workspace.progress;
  const barWidth = Math.max(
    progress?.bar_percent && Number(progress.raised) > 0 ? 2 : 0,
    Number(progress?.bar_percent ?? 0),
  );
  const policy = workspace.lifecycle_policy || donationLifecyclePolicy;
  const assetLocked = Boolean(workspace.asset_locked);

  const switchTab = (next: TabId) => {
    if (dirty && tab === "settings" && next !== "settings") {
      if (!window.confirm("You have unsaved Settings changes. Leave without saving?")) return;
      setForm(formFromCampaign(campaign));
      setDirty(false);
      setEditing(false);
    }
    setTab(next);
  };

  return (
    <>
      <AdminPageHeader
        title={campaign.title}
        description={campaign.summary || campaign.slug || ""}
        backHref="/admin/donations"
        breadcrumbs={[
          { label: "Donations", href: "/admin/donations" },
          { label: campaign.title },
        ]}
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              {campaign.status !== "active" ? (
                <button
                  type="button"
                  onClick={() => void runAction("activate")}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Activate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void runAction("pause")}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Pause
                </button>
              )}
              <button
                type="button"
                onClick={() => void runAction(campaign.is_featured ? "unfeature" : "feature")}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                {campaign.is_featured ? "Unfeature" : "Feature"}
              </button>
              <button
                type="button"
                onClick={() => switchTab("settings")}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                Edit campaign
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Close / delete
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

      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => switchTab(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === item.id ? "bg-muted font-medium text-text-primary" : "text-text-secondary hover:bg-muted/60"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            {media.display_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.display_url}
                alt=""
                className="mb-3 h-44 w-full rounded-lg object-cover"
              />
            ) : null}
            {media.using_thumbnail_as_cover ? (
              <p className="mb-3 text-xs text-amber-700">
                Mobile hero is using the thumbnail because cover is empty.
              </p>
            ) : null}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge tone={requestTone(campaign.status)}>
                {donationStatusLabel(campaign.status)}
              </StatusBadge>
              {campaign.is_featured ? <StatusBadge tone="success">Featured</StatusBadge> : null}
              <span className="text-xs text-text-secondary">{campaignAssetLabel(campaign)}</span>
            </div>
            <p className="text-sm text-text-secondary whitespace-pre-wrap">
              {campaign.description || campaign.summary || "No description."}
            </p>
            <div className="mt-4 mb-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${barWidth}%` }} />
            </div>
            <p className="text-sm font-medium">
              {formatDonationAmount(Number(progress?.raised ?? 0), displayCurrency)} raised
              {Number(progress?.goal ?? 0) > 0
                ? ` of ${formatDonationAmount(Number(progress?.goal ?? 0), displayCurrency)} (${progress?.label || "0%"})`
                : ""}
            </p>
            {progress?.note ? (
              <p className="mt-1 text-[11px] text-text-hint">{progress.note}</p>
            ) : null}
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">Attribution</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-text-secondary">Public beneficiary</dt>
                  <dd className="text-right font-medium">
                    {workspace.attribution?.public_beneficiary_org?.name ||
                      workspace.attribution?.public_beneficiary_name ||
                      campaign.beneficiary_user_id ||
                      "Spojex (platform default)"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-text-secondary">Managing organization</dt>
                  <dd className="text-right">
                    {workspace.attribution?.public_beneficiary_org?.name || "—"}
                    {workspace.attribution?.public_beneficiary_org?.is_platform
                      ? " (platform)"
                      : ""}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-text-secondary">Redeem / payout</dt>
                  <dd className="max-w-[60%] text-right text-xs text-text-secondary">
                    {workspace.attribution?.redeem_authorized || "See Finance"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] text-text-hint">
                {workspace.attribution?.credited_recipient_note}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Unique donors", value: workspace.aggregates?.unique_donors ?? 0 },
                { label: "Completed", value: workspace.aggregates?.completed_count ?? 0 },
                { label: "Pending", value: workspace.aggregates?.pending_count ?? 0 },
                { label: "Reversed / refunded", value: workspace.aggregates?.reversed_count ?? 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs text-text-secondary">{item.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>

            {(workspace.alerts?.length ?? 0) > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="mb-2 font-medium">Needs review</p>
                <ul className="list-disc space-y-1 pl-5">
                  {workspace.alerts?.map((alert) => (
                    <li key={alert}>{alert}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Recent contributions</h2>
                <button
                  type="button"
                  onClick={() => switchTab("contributions")}
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </button>
              </div>
              {(workspace.recent_contributions?.length ?? 0) === 0 ? (
                <p className="text-sm text-text-secondary">No contributions yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {workspace.recent_contributions?.slice(0, 5).map((row) => {
                    const src = contributionPaymentLabel(row);
                    return (
                      <li key={row.id} className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-0">
                        <div>
                          <p className="font-medium">
                            {row.is_anonymous ? "Anonymous" : row.donor_display_name || "Donor"}
                          </p>
                          <p className="text-xs text-text-hint">
                            {src.label} · {src.reference}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="tabular-nums">
                            {formatDonationAmount(row.amount, row.currency)}
                          </p>
                          <StatusBadge tone={requestTone(row.status)}>{row.status}</StatusBadge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <p className="text-xs text-text-hint">
              Lifecycle: {String((policy as Record<string, string>).active || donationLifecyclePolicy.active)}{" "}
              Pause: {String((policy as Record<string, string>).paused || donationLifecyclePolicy.paused)}
            </p>
            <p className="text-xs text-text-secondary">
              Edit details and media in Settings. Financial activity stays in Contributions / Finance.
            </p>
          </section>
        </div>
      ) : null}

      {tab === "contributions" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <AdminSearchInput
                value={contribQ}
                onChange={setContribQ}
                placeholder="Search reference, donor, message"
              />
            </div>
            <AdminSelect value={contribStatus} onChange={(v) => { setContribStatus(v); setContribPage(1); }}>
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
              <option value="reversed">Reversed</option>
            </AdminSelect>
            {!canExport ? (
              <p className="text-xs text-text-hint">Donor export requires finance or write permission.</p>
            ) : null}
          </div>
          {contribLoading ? <AdminLoadingRow label="Loading contributions…" /> : null}
          <AdminTableShell>
            {!contribLoading && contribs.length === 0 ? (
              <AdminEmpty title="No contributions" description="Matching filters returned nothing." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Reference</th>
                      <th className="px-4 py-3 font-semibold">Donor</th>
                      <th className="px-4 py-3 font-semibold">Amount</th>
                      <th className="px-4 py-3 font-semibold">Source</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Message</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contribs.map((row) => {
                      const src = contributionPaymentLabel(row);
                      return (
                        <tr key={row.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-mono text-xs">
                            {row.transaction_reference || src.reference}
                          </td>
                          <td className="px-4 py-3">
                            {row.is_anonymous ? (
                              "Anonymous"
                            ) : row.user_id ? (
                              <Link href={`/admin/users/${row.user_id}`} className="text-primary">
                                {row.donor_display_name || "Donor"}
                              </Link>
                            ) : (
                              row.donor_display_name || "—"
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium tabular-nums">
                            {formatDonationAmount(row.amount, row.currency)}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">{src.label}</td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={requestTone(row.status)}>{row.status}</StatusBadge>
                          </td>
                          <td className="max-w-[180px] truncate px-4 py-3 text-text-secondary">
                            {sanitizeDonorMessage(row.message) || "—"}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {formatDate(row.paid_at || row.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={row.finance_href || `/admin/finance/transactions?module=donations&q=${row.id}`}
                              className="text-xs text-primary hover:underline"
                            >
                              Open transaction
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </AdminTableShell>
          {contribTotal > 40 ? (
            <div className="flex items-center justify-between text-sm">
              <p className="text-text-secondary">
                Page {contribPage} · {contribTotal} contributions
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={contribPage <= 1}
                  onClick={() => setContribPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={contribPage * 40 >= contribTotal}
                  onClick={() => setContribPage((p) => p + 1)}
                  className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "disbursements" ? (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold">Disbursements</h2>
          <p className="text-sm text-text-secondary">
            {workspace.disbursements?.message ||
              "Campaign disbursement is not implemented. Coin wallet credit is not a campaign payout."}
          </p>
          <p className="mt-3 text-sm">
            <Link href="/admin/finance/transactions?module=donations" className="text-primary hover:underline">
              Open Finance transactions
            </Link>
          </p>
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Settings</h2>
              <p className="text-xs text-text-secondary">
                Explicit save — edits do not autosave.
              </p>
            </div>
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                  >
                    Edit campaign
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => cancelEdit()}
                      className="rounded-md border border-border px-3 py-2 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={saving || !dirty}
                      onClick={() => void saveSettings()}
                      className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">Read-only access.</p>
            )}
          </div>

          {dirty ? (
            <p className="mb-3 text-xs text-amber-700">Unsaved changes</p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-text-secondary">Title</span>
              <input
                value={form.title}
                disabled={!editing || !canWrite}
                onChange={(e) => updateForm({ title: e.target.value })}
                className={fieldClass}
              />
              {fieldErrors.title ? (
                <span className="text-xs text-red-600">{fieldErrors.title}</span>
              ) : null}
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-text-secondary">Summary</span>
              <input
                value={form.summary}
                disabled={!editing || !canWrite}
                onChange={(e) => updateForm({ summary: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-text-secondary">Description</span>
              <textarea
                value={form.description}
                disabled={!editing || !canWrite}
                onChange={(e) => updateForm({ description: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
            </label>

            <DonationImagePicker
              label="Cover image"
              hint="Mobile hero. JPG/PNG/WebP/GIF · 5 MB. Current image kept until replacement succeeds."
              previewUrl={(campaign.cover_url || "").trim()}
              inputRef={coverInputRef}
              disabled={!canWrite}
              uploading={uploadingKind === "cover"}
              onPick={(file) => void uploadImage("cover", file)}
              onRemoveRemote={
                canWrite && (campaign.cover_url || "").trim()
                  ? () => clearImage("cover")
                  : undefined
              }
            />
            <DonationImagePicker
              label="Thumbnail"
              hint={
                media.using_thumbnail_as_cover
                  ? "Used as cover fallback on mobile because cover is empty."
                  : "Optional list/card thumbnail."
              }
              previewUrl={(campaign.image_url || "").trim()}
              inputRef={thumbInputRef}
              disabled={!canWrite}
              uploading={uploadingKind === "image"}
              onPick={(file) => void uploadImage("image", file)}
              onRemoveRemote={
                canWrite && (campaign.image_url || "").trim()
                  ? () => clearImage("image")
                  : undefined
              }
            />

            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Asset</span>
              <select
                value={form.currency}
                disabled={!editing || !canWrite || assetLocked}
                onChange={(e) => updateForm({ currency: e.target.value })}
                className={fieldClass}
              >
                <option value="COIN">Coins</option>
                <option value="ETB">ETB</option>
              </select>
              {assetLocked ? (
                <span className="mt-1 block text-[11px] text-text-hint">
                  Locked after contributions — historical coins cannot be relabeled as ETB.
                </span>
              ) : null}
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">
                {form.currency.toUpperCase().startsWith("COIN") ? "Goal (coins)" : "Goal (ETB)"}
              </span>
              <input
                type="number"
                min={1}
                value={form.goal}
                disabled={!editing || !canWrite}
                onChange={(e) => updateForm({ goal: e.target.value })}
                className={fieldClass}
              />
              {fieldErrors.goal ? (
                <span className="text-xs text-red-600">{fieldErrors.goal}</span>
              ) : null}
            </label>

            <div className="text-sm md:col-span-2">
              <span className="mb-1 block text-text-secondary">Public beneficiary</span>
              <BeneficiarySelect
                value={form.beneficiary_user_id}
                disabled={!editing || !canWrite}
                onChange={(userId) => updateForm({ beneficiary_user_id: userId })}
              />
              {editing &&
              form.beneficiary_user_id !== (campaign.beneficiary_user_id || "") ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Changing beneficiary updates future contributions only. Historical
                  credited_user_id snapshots stay unchanged.
                </div>
              ) : null}
            </div>

            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Status</span>
              <select
                value={form.status}
                disabled={!editing || !canWrite}
                onChange={(e) => updateForm({ status: e.target.value })}
                className={fieldClass}
              >
                {donationStatuses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Sort order</span>
              <input
                type="number"
                value={form.sort_order}
                disabled={!editing || !canWrite}
                onChange={(e) => updateForm({ sort_order: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_featured}
                disabled={!editing || !canWrite}
                onChange={(e) => updateForm({ is_featured: e.target.checked })}
              />
              Featured placement (independent of status)
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-text-secondary">
                Reason (required for beneficiary / pause / close)
              </span>
              <input
                value={form.reason}
                disabled={!editing || !canWrite}
                onChange={(e) => updateForm({ reason: e.target.value })}
                placeholder="Audit reason"
                className={fieldClass}
              />
              {fieldErrors.reason ? (
                <span className="text-xs text-red-600">{fieldErrors.reason}</span>
              ) : null}
            </label>
          </div>

          <div className="mt-8">
            <h3 className="mb-3 text-sm font-semibold">Activity</h3>
            {(workspace.activity?.length ?? 0) === 0 ? (
              <p className="text-sm text-text-secondary">No admin audit events yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {workspace.activity?.map((event) => (
                  <li key={event.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{event.action}</span>
                      <span className="text-xs text-text-hint">{formatDate(event.created_at)}</span>
                    </div>
                    {event.reason ? (
                      <p className="mt-1 text-xs text-text-secondary">{event.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
