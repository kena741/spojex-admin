"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone, type StatusTone } from "@/components/status-badge";
import { adminFetch, patchAdmin, uploadAdmin } from "@/lib/hooks";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import {
  ELIGIBLE_ROLE_OPTIONS,
  applicationStatusLabel,
  applicationStatuses,
  emptyOpportunityDraft,
  formatOpportunityFee,
  opportunityStatusLabel,
  opportunityStatuses,
  opportunityStatusTone,
  rowToDraft,
  type OpportunityDraft,
  type OpportunityRevenue,
  type OpportunityRow,
} from "@/lib/opportunities";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { formatDate } from "@/lib/utils";

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const areaClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

const tabs = [
  { id: "details", label: "Details" },
  { id: "applications", label: "Applications" },
  { id: "payments", label: "Payments" },
] as const;

type TabId = (typeof tabs)[number]["id"];

type ApplicationRow = {
  id: string;
  status: string;
  payment_status: string;
  amount_paid: number;
  message: string;
  profile_completion_percent: number;
  provider_ref: string | null;
  submitted_at: string | null;
  created_at: string;
  admin_note: string;
  users?: {
    id: string;
    display_name?: string | null;
    avatar_url?: string | null;
    role?: string | null;
    username?: string | null;
  } | null;
};

type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  provider_ref: string | null;
  paid_at: string | null;
  created_at: string;
};

function applicationTone(status: string): StatusTone {
  switch (status) {
    case "accepted":
    case "shortlisted":
      return "success";
    case "under_review":
    case "submitted":
      return "warning";
    case "rejected":
    case "withdrawn":
      return "danger";
    case "draft":
      return "neutral";
    default:
      return requestTone(status);
  }
}

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { can } = useAdminPermissions();
  const canWrite = can("opportunities:write");

  const [tab, setTab] = useState<TabId>("details");
  const [row, setRow] = useState<OpportunityRow | null>(null);
  const [draft, setDraft] = useState<OpportunityDraft>(emptyOpportunityDraft());
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [revenue, setRevenue] = useState<OpportunityRevenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAppId, setBusyAppId] = useState<string | null>(null);

  const load = async () => {
    const response = await adminFetch(`/api/admin/opportunities/${id}`);
    const payload = (await response.json()) as {
      data?: OpportunityRow;
      applications?: ApplicationRow[];
      payments?: PaymentRow[];
      waitlist?: unknown[];
      revenue?: OpportunityRevenue;
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load");
    if (!payload.data) throw new Error("Opportunity not found");
    setRow(payload.data);
    setDraft(rowToDraft(payload.data));
    setApplications(payload.applications ?? []);
    setPayments(payload.payments ?? []);
    setWaitlistCount(payload.waitlist?.length ?? 0);
    setRevenue(payload.revenue ?? null);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async (extras?: Record<string, unknown>) => {
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(`/api/admin/opportunities/${id}`, {
        ...draft,
        ...extras,
      } as unknown as Record<string, unknown>);
      await load();
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (status: OpportunityDraft["status"], notify = false) => {
    setDraft((d) => ({ ...d, status }));
    await save({ status, notify_waitlist: notify });
  };

  const uploadCover = async (file: File) => {
    if (!canWrite) return;
    setUploading(true);
    setError(null);
    try {
      const payload = await uploadAdmin("/api/admin/opportunities/upload", file);
      const url = toBackendMediaUrl(
        typeof payload.image_url === "string" ? payload.image_url : "",
      );
      if (!url) throw new Error("Upload did not return an image URL");
      setDraft((d) => ({ ...d, cover_image_url: url }));
      setNotice("Cover uploaded — save changes to keep it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const updateApplication = async (
    applicationId: string,
    status: string,
    notify: boolean,
  ) => {
    setBusyAppId(applicationId);
    setError(null);
    try {
      await patchAdmin(`/api/admin/opportunities/applications/${applicationId}`, {
        status,
        notify,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update application");
    } finally {
      setBusyAppId(null);
    }
  };

  const toggleRole = (role: string) => {
    setDraft((prev) => {
      const set = new Set(prev.eligible_roles);
      if (set.has(role)) set.delete(role);
      else set.add(role);
      return { ...prev, eligible_roles: [...set] };
    });
  };

  if (loading) {
    return (
      <>
        <AdminPageHeader
          title="Opportunity"
          description="Loading…"
          backHref="/admin/opportunities"
        />
        <AdminLoadingRow label="Loading opportunity…" />
      </>
    );
  }

  if (!row) {
    return (
      <>
        <AdminPageHeader
          title="Opportunity"
          description="Not found"
          backHref="/admin/opportunities"
        />
        {error ? <AdminErrorAlert message={error} /> : null}
        <Link href="/admin/opportunities" className="text-sm text-primary hover:underline">
          Back to list
        </Link>
      </>
    );
  }

  const cover = toBackendMediaUrl(draft.cover_image_url);

  return (
    <>
      <AdminPageHeader
        title={row.title}
        description={`${row.category || "Opportunity"} · ${formatOpportunityFee(row.fee_type, row.fee_amount)} · Waitlist ${waitlistCount}`}
        backHref="/admin/opportunities"
        breadcrumbs={[
          { label: "Opportunities", href: "/admin/opportunities" },
          { label: row.title },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={opportunityStatusTone(row.status)}>
              {opportunityStatusLabel(row.status)}
            </StatusBadge>
            {row.is_published ? (
              <StatusBadge tone="success">Published</StatusBadge>
            ) : (
              <StatusBadge tone="warning">Draft</StatusBadge>
            )}
            {canWrite ? (
              <>
                {!row.is_published ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => save({ is_published: true })}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Publish
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => quickStatus("open", true)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Open + notify
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => quickStatus("closed")}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </>
            ) : null}
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <section className="mb-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-sm font-semibold">Overview</h2>
          <p className="text-xs text-text-hint">Applications and fee collection</p>
        </div>
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {[
            {
              label: "Applicants",
              hint: "Total applications",
              value: `${revenue?.total_applicants ?? 0}`,
            },
            {
              label: "Paid",
              hint: "Paid applicants",
              value: `${revenue?.paid_applicants ?? 0}`,
            },
            {
              label: "Payments",
              hint: "Successful charges",
              value: `${revenue?.successful_payments ?? 0}`,
            },
            {
              label: "Collected",
              hint: "ETB",
              value: `ETB ${(revenue?.total_collected ?? 0).toLocaleString()}`,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="py-4 first:pt-0 last:pb-0 sm:px-6 sm:py-1 sm:first:pl-0 sm:last:pr-0"
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-hint">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-text-primary">
                {item.value}
              </p>
              <p className="mt-1 text-xs text-text-secondary">{item.hint}</p>
            </div>
          ))}
        </div>
      </section>

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
            {item.id === "applications" ? ` (${applications.length})` : null}
            {item.id === "payments" ? ` (${payments.length})` : null}
          </button>
        ))}
      </div>

      {tab === "details" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-heading text-sm font-semibold">Cover image</h2>
              <StatusBadge tone={opportunityStatusTone(draft.status)}>
                {opportunityStatusLabel(draft.status)}
              </StatusBadge>
            </div>
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="mb-4 h-56 w-full rounded-xl object-cover" />
            ) : (
              <div className="mb-4 flex h-56 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-sm text-text-secondary">
                No cover image yet
              </div>
            )}
            {canWrite ? (
              <div>
                <p className="mb-1 text-sm font-medium text-text-primary">Upload cover</p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadCover(file);
                  }}
                  className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                />
                <p className="mt-1 text-xs text-text-secondary">
                  JPG, PNG, WebP, or GIF · save changes after upload
                </p>
                {uploading ? (
                  <p className="mt-1 text-xs text-text-secondary">Uploading…</p>
                ) : null}
                {cover ? (
                  <button
                    type="button"
                    className="mt-3 text-xs text-text-secondary underline hover:text-text-primary"
                    onClick={() => setDraft((d) => ({ ...d, cover_image_url: "" }))}
                  >
                    Clear cover
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-4 font-heading text-sm font-semibold">Basics</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title" className="sm:col-span-2">
                  <input
                    className={fieldClass}
                    value={draft.title}
                    disabled={!canWrite}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                </Field>
                <Field label="Category">
                  <input
                    className={fieldClass}
                    value={draft.category}
                    disabled={!canWrite}
                    onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  />
                </Field>
                <Field label="Organizer">
                  <input
                    className={fieldClass}
                    value={draft.organizer}
                    disabled={!canWrite}
                    onChange={(e) => setDraft((d) => ({ ...d, organizer: e.target.value }))}
                  />
                </Field>
                <Field label="Location">
                  <input
                    className={fieldClass}
                    value={draft.location}
                    disabled={!canWrite}
                    onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                  />
                </Field>
                <Field label="Country">
                  <input
                    className={fieldClass}
                    value={draft.country}
                    disabled={!canWrite}
                    onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value }))}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className={fieldClass}
                    value={draft.status}
                    disabled={!canWrite}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        status: e.target.value as OpportunityDraft["status"],
                      }))
                    }
                  >
                    {opportunityStatuses.map((status) => (
                      <option key={status} value={status}>
                        {opportunityStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="External link">
                  <input
                    className={fieldClass}
                    disabled={!canWrite}
                    value={draft.external_link}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, external_link: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Description" className="sm:col-span-2">
                  <textarea
                    className={areaClass}
                    rows={5}
                    disabled={!canWrite}
                    value={draft.description}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, description: e.target.value }))
                    }
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-4 font-heading text-sm font-semibold">Schedule & fees</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start date">
                  <input
                    className={fieldClass}
                    type="date"
                    value={draft.start_date}
                    disabled={!canWrite}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, start_date: e.target.value }))
                    }
                  />
                </Field>
                <Field label="End date">
                  <input
                    className={fieldClass}
                    type="date"
                    value={draft.end_date}
                    disabled={!canWrite}
                    onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                  />
                </Field>
                <Field label="Applications open">
                  <input
                    className={fieldClass}
                    type="datetime-local"
                    value={draft.application_opens_at}
                    disabled={!canWrite}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, application_opens_at: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Application deadline">
                  <input
                    className={fieldClass}
                    type="datetime-local"
                    value={draft.application_deadline}
                    disabled={!canWrite}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, application_deadline: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Fee type">
                  <select
                    className={fieldClass}
                    value={draft.fee_type}
                    disabled={!canWrite}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        fee_type: e.target.value as OpportunityDraft["fee_type"],
                      }))
                    }
                  >
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                  </select>
                </Field>
                <Field label="Fee amount (ETB)">
                  <input
                    className={fieldClass}
                    type="number"
                    min={0}
                    disabled={!canWrite || draft.fee_type !== "paid"}
                    value={draft.fee_amount}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, fee_amount: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Min profile completion %">
                  <input
                    className={fieldClass}
                    type="number"
                    min={0}
                    max={100}
                    disabled={!canWrite}
                    value={draft.min_profile_completion}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        min_profile_completion: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Max applicants">
                  <input
                    className={fieldClass}
                    type="number"
                    min={1}
                    disabled={!canWrite}
                    value={draft.max_applicants}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, max_applicants: e.target.value }))
                    }
                    placeholder="Unlimited"
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-4 font-heading text-sm font-semibold">Eligibility & terms</h2>
              <div className="space-y-3">
                <Field label="Eligibility requirements">
                  <textarea
                    className={areaClass}
                    rows={3}
                    disabled={!canWrite}
                    value={draft.eligibility_requirements}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        eligibility_requirements: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Required information / documents">
                  <textarea
                    className={areaClass}
                    rows={2}
                    disabled={!canWrite}
                    value={draft.required_documents}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, required_documents: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Additional terms / instructions">
                  <textarea
                    className={areaClass}
                    rows={2}
                    disabled={!canWrite}
                    value={draft.additional_terms}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, additional_terms: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Eligible roles (empty = all)">
                  <div className="flex flex-wrap gap-2">
                    {ELIGIBLE_ROLE_OPTIONS.map((role) => {
                      const selected = draft.eligible_roles.includes(role.value);
                      return (
                        <button
                          key={role.value}
                          type="button"
                          disabled={!canWrite}
                          onClick={() => toggleRole(role.value)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "border border-border text-text-secondary hover:bg-muted"
                          }`}
                        >
                          {role.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <div className="flex flex-wrap gap-4 pt-1 text-sm text-text-primary">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={!canWrite}
                      checked={draft.is_published}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, is_published: e.target.checked }))
                      }
                      className="rounded border-border text-primary focus:ring-primary/20"
                    />
                    Published
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={!canWrite}
                      checked={draft.allow_multiple_applications}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          allow_multiple_applications: e.target.checked,
                        }))
                      }
                      className="rounded border-border text-primary focus:ring-primary/20"
                    />
                    Allow multiple applications
                  </label>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "applications" ? (
        <AdminTableShell>
          {applications.length === 0 ? (
            <AdminEmpty
              title="No applications yet"
              description="Players who apply will show up here for review."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Player</th>
                    <th className="px-4 py-3 font-semibold">Profile %</th>
                    <th className="px-4 py-3 font-semibold">Message</th>
                    <th className="px-4 py-3 font-semibold">Applied</th>
                    <th className="px-4 py-3 font-semibold">Payment</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    {canWrite ? (
                      <th className="px-4 py-3 font-semibold">Update</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr
                      key={app.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">
                          {app.users?.display_name || "Player"}
                        </div>
                        <div className="text-xs text-text-secondary">
                          {app.users?.role || "—"}
                          {app.users?.id ? (
                            <>
                              {" · "}
                              <Link
                                href={`/admin/users/${app.users.id}`}
                                className="text-primary hover:underline"
                              >
                                Profile
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {app.profile_completion_percent}%
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-text-secondary">
                        {app.message || "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDate(app.submitted_at || app.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={requestTone(app.payment_status)}>
                          {app.payment_status.replaceAll("_", " ")}
                        </StatusBadge>
                        {app.amount_paid > 0 ? (
                          <div className="mt-1 text-xs text-text-secondary">
                            ETB {Number(app.amount_paid).toLocaleString()}
                            {app.provider_ref ? ` · ${app.provider_ref}` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={applicationTone(app.status)}>
                          {applicationStatusLabel(app.status)}
                        </StatusBadge>
                      </td>
                      {canWrite ? (
                        <td className="px-4 py-3">
                          <select
                            className="h-9 rounded-lg border border-border bg-card px-2 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            disabled={busyAppId === app.id}
                            value={app.status}
                            onChange={(e) => {
                              const next = e.target.value;
                              const notify = window.confirm(
                                "Notify the player about this status update?",
                              );
                              void updateApplication(app.id, next, notify);
                            }}
                          >
                            {applicationStatuses.map((status) => (
                              <option key={status} value={status}>
                                {applicationStatusLabel(status)}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminTableShell>
      ) : null}

      {tab === "payments" ? (
        <AdminTableShell>
          {payments.length === 0 ? (
            <AdminEmpty
              title="No payment records"
              description="Successful and pending fee payments appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Reference</th>
                    <th className="px-4 py-3 font-semibold">Paid at</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((pay) => (
                    <tr
                      key={pay.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-medium tabular-nums">
                        ETB {Number(pay.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={requestTone(pay.status)}>
                          {pay.status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                        {pay.provider_ref || "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDate(pay.paid_at || pay.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminTableShell>
      ) : null}
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 text-sm ${className ?? ""}`}>
      <span className="font-medium text-text-primary">{label}</span>
      {children}
    </label>
  );
}
