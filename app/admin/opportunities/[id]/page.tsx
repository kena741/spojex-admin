"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone, type StatusTone } from "@/components/status-badge";
import { adminFetch, patchAdmin, uploadAdmin } from "@/lib/hooks";
import {
  APPLICATION_TRANSITIONS,
  applicationActionLabel,
  opportunityPaymentLabel,
  reasonRequiredFor,
} from "@/lib/opportunity-payment";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import {
  ELIGIBLE_ROLE_OPTIONS,
  applicationStatusLabel,
  emptyOpportunityDraft,
  formatOpportunityFee,
  opportunityStatusLabel,
  opportunityStatuses,
  opportunityStatusTone,
  rowToDraft,
  validateOpportunityDraft,
  type OpportunityDraft,
  type OpportunityRevenue,
  type OpportunityRow,
} from "@/lib/opportunities";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const areaClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "applications", label: "Applications" },
  { id: "waitlist", label: "Waitlist" },
  { id: "payments", label: "Payments" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof tabs)[number]["id"];

type DecisionEntry = {
  at?: string;
  actor_id?: string;
  from?: string;
  to?: string;
  reason?: string | null;
  internal_note?: string | null;
  applicant_message?: string | null;
};

type ApplicationRow = {
  id: string;
  status: string;
  payment_status: string;
  payment_label?: string;
  amount_paid: number;
  message: string;
  profile_completion_percent: number;
  provider_ref: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at?: string;
  admin_note: string;
  reference?: string;
  people_href?: string;
  allowed_transitions?: string[];
  extra_answers?: Record<string, unknown>;
  fee_snapshot?: {
    fee_type?: string;
    fee_amount?: string;
    currency?: string;
    quoted_at?: string;
  } | null;
  terms_snapshot?: {
    terms_version?: number;
    additional_terms?: string;
    eligibility_requirements?: string;
    required_documents?: string;
    snapshotted_at?: string;
  } | null;
  profile_snapshot?: {
    profile_completion_percent?: number;
    snapshotted_at?: string;
  } | null;
  decision_history?: DecisionEntry[];
  applicant_messages?: { at?: string; status?: string; message?: string }[];
  users?: {
    id: string;
    display_name?: string | null;
    avatar_url?: string | null;
    role?: string | null;
    username?: string | null;
    email?: string | null;
  } | null;
};

type PaymentRow = {
  id: string;
  application_id?: string;
  amount: number;
  currency?: string;
  status: string;
  label?: string;
  provider_ref: string | null;
  paid_at: string | null;
  created_at: string;
  finance_href?: string;
  finance_tx_id?: string;
};

type WaitlistRow = {
  id: string;
  user_id: string;
  created_at: string;
  notified_at: string | null;
  state?: string;
  state_label?: string;
  people_href?: string;
  related_application_id?: string | null;
  related_application_status?: string | null;
  users?: {
    id: string;
    display_name?: string | null;
    avatar_url?: string | null;
    role?: string | null;
  } | null;
};

type Overview = {
  timezone?: string;
  applicant_count?: number;
  waitlist_count?: number;
  review_queue?: number;
  verified_collections?: string;
  currency?: string;
  capacity?: number | null;
  capacity_remaining?: number | null;
  scheduling_issues?: string[];
  config_missing?: string[];
  applications_open_at?: string | null;
  application_deadline?: string | null;
  event_start?: string | null;
  event_end?: string | null;
  waitlist_definition?: string;
  terms_version?: number;
  schedule_timezone_note?: string;
  next_scheduled_transition?: {
    action?: string;
    at?: string;
    label?: string;
  } | null;
};

type AuditRow = {
  action?: string;
  summary?: string;
  created_at?: string;
  admin_name?: string;
  outcome?: string;
};

type ScheduleRun = {
  action?: string;
  summary?: string;
  created_at?: string;
  admin_name?: string;
  metadata?: Record<string, unknown>;
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
    default:
      return requestTone(status);
  }
}

function Field({
  label,
  children,
  className,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <label className={cn("grid gap-1 text-sm", className)}>
      <span className="text-text-secondary">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-text-hint">{hint}</span> : null}
    </label>
  );
}

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = can("opportunities:write");

  const tab = (searchParams.get("tab") as TabId) || "overview";
  const selectedAppId = searchParams.get("app") || "";

  const [row, setRow] = useState<OpportunityRow | null>(null);
  const [draft, setDraft] = useState<OpportunityDraft>(emptyOpportunityDraft());
  const [baseline, setBaseline] = useState("");
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [revenue, setRevenue] = useState<OpportunityRevenue | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [lastScheduleRun, setLastScheduleRun] = useState<ScheduleRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAppId, setBusyAppId] = useState<string | null>(null);
  const [applicantFacing, setApplicantFacing] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [listReturn, setListReturn] = useState("/admin/opportunities");

  const dirty = useMemo(
    () => baseline !== "" && JSON.stringify(draft) !== baseline,
    [draft, baseline],
  );

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("opportunities-return");
      if (stored) setListReturn(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const writeParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async () => {
    const response = await adminFetch(`/api/admin/opportunities/${id}`);
    const payload = (await response.json()) as {
      data?: OpportunityRow;
      applications?: ApplicationRow[];
      payments?: PaymentRow[];
      waitlist?: WaitlistRow[];
      overview?: Overview;
      revenue?: OpportunityRevenue;
      audit?: AuditRow[];
      last_schedule_run?: ScheduleRun | null;
      error?: string;
    };
    if (response.status === 403) throw new Error("Permission denied");
    if (!response.ok) throw new Error(payload.error || "Failed to load");
    if (!payload.data) throw new Error("Opportunity not found");
    setRow(payload.data);
    const d = rowToDraft(payload.data);
    setDraft(d);
    setBaseline(JSON.stringify(d));
    setApplications(payload.applications ?? []);
    setPayments(payload.payments ?? []);
    setWaitlist(payload.waitlist ?? []);
    setOverview(payload.overview ?? null);
    setRevenue(payload.revenue ?? null);
    setAudit(payload.audit ?? []);
    setLastScheduleRun(payload.last_schedule_run ?? null);
  }, [id]);

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const selectedApp = applications.find((a) => a.id === selectedAppId) || null;

  const save = async (extras?: Record<string, unknown>) => {
    if (!canWrite) return;
    const statusOnly =
      !dirty &&
      extras != null &&
      Object.keys(extras).every((k) =>
        ["status", "is_published", "notify_waitlist"].includes(k),
      );
    if (!statusOnly) {
      const validation = validateOpportunityDraft(draft);
      if (validation) {
        setError(validation);
        return;
      }
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = (await patchAdmin(`/api/admin/opportunities/${id}`, {
        ...(statusOnly ? {} : draft),
        ...extras,
        expected_updated_at: row?.updated_at,
      } as unknown as Record<string, unknown>)) as {
        notify?: { waitlist?: number; sent?: number; skipped?: number };
        terms_bumped?: boolean;
      };
      await load();
      const parts: string[] = ["Saved."];
      if (payload?.terms_bumped) {
        parts.push("Terms version bumped (existing applications keep their snapshot).");
      }
      if (payload?.notify) {
        parts.push(
          `Waitlist notify: ${payload.notify.sent ?? 0} sent, ${payload.notify.skipped ?? 0} inbox-only of ${payload.notify.waitlist ?? 0}.`,
        );
      }
      setNotice(parts.join(" "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    if (row) {
      const d = rowToDraft(row);
      setDraft(d);
      setBaseline(JSON.stringify(d));
    }
  };

  const openNotify = async () => {
    if (!canWrite) return;
    const missing = overview?.config_missing ?? [];
    const issues = overview?.scheduling_issues ?? [];
    if (missing.length || issues.length) {
      const proceed = window.confirm(
        `Configuration warnings:\n${[...issues, ...missing.map((m) => `Missing: ${m}`)].join("\n")}\n\nOpen anyway?`,
      );
      if (!proceed) return;
    }
    if (dirty) {
      const proceed = window.confirm(
        "You have unsaved settings. Open + notify will include those unsaved changes, set status to Open, publish, then notify the interest waitlist. Continue?",
      );
      if (!proceed) return;
    }
    const audience = waitlist.filter((w) => !w.notified_at).length;
    if (
      !window.confirm(
        `Intended change: status → Open, published → yes.\nNotify audience: ${audience} waitlisted user(s) not yet notified (deduped by notified_at).\nExisting applications/payments are unchanged.`,
      )
    ) {
      return;
    }
    await save({ status: "open", is_published: true, notify_waitlist: true });
  };

  const closeApps = async () => {
    if (!canWrite) return;
    if (
      !window.confirm(
        "Close applications? Existing applications and payments are preserved. This does not delete the opportunity.",
      )
    ) {
      return;
    }
    setDraft((d) => ({ ...d, status: "closed" }));
    await save({ status: "closed" });
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
      setNotice("Cover uploaded - save settings to keep it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const reviewApp = async (application: ApplicationRow, next: string, notify: boolean) => {
    if (!canWrite) return;
    let reason = "";
    if (reasonRequiredFor(next)) {
      reason = window.prompt("Reason (required, recorded for audit):") || "";
      if (!reason.trim()) return;
    }
    setBusyAppId(application.id);
    setError(null);
    try {
      await patchAdmin(`/api/admin/opportunities/applications/${application.id}`, {
        status: next,
        reason,
        internal_note: internalNote.trim() || undefined,
        applicant_message: applicantFacing.trim() || undefined,
        expected_updated_at: application.updated_at,
        notify,
      });
      setApplicantFacing("");
      setInternalNote("");
      await load();
      setNotice(`Application ${applicationActionLabel(next).toLowerCase()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update application");
    } finally {
      setBusyAppId(null);
    }
  };

  if (loading) {
    return (
      <>
        <AdminPageHeader title="Opportunity" description="Loading…" backHref={listReturn} />
        <AdminLoadingRow label="Loading opportunity…" />
      </>
    );
  }

  if (!row) {
    return (
      <>
        <AdminPageHeader
          title="Opportunity"
          description={error === "Permission denied" ? "Permission denied" : "Not found"}
          backHref={listReturn}
        />
        {error ? <AdminErrorAlert message={error} /> : null}
      </>
    );
  }

  const cover = toBackendMediaUrl(draft.cover_image_url || row.cover_image_url);
  const payLabel = (app: ApplicationRow) =>
    app.payment_label ||
    opportunityPaymentLabel(row.fee_type, app.payment_status);

  return (
    <>
      <AdminPageHeader
        title={row.title}
        description={`${row.category || "Opportunity"} · ${formatOpportunityFee(row.fee_type, row.fee_amount)}`}
        backHref={listReturn}
        breadcrumbs={[
          { label: "Opportunities", href: listReturn },
          { label: row.title },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={opportunityStatusTone(row.status)}>
              {opportunityStatusLabel(row.status)}
            </StatusBadge>
            <StatusBadge tone={row.is_published ? "success" : "warning"}>
              {row.is_published ? "Published" : "Draft"}
            </StatusBadge>
            {canWrite ? (
              <>
                {!row.is_published ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save({ is_published: true })}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Publish
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void openNotify()}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Open + notify
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void closeApps()}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Close applications
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
      {dirty && tab === "settings" ? (
        <p className="mb-3 text-xs text-amber-800">Unsaved settings changes</p>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (dirty && tab === "settings" && item.id !== "settings") {
                if (!window.confirm("Leave settings with unsaved changes?")) return;
              }
              writeParams({ tab: item.id, app: item.id === "applications" ? selectedAppId || null : null });
            }}
            className={`px-4 py-2.5 text-sm font-medium ${
              tab === item.id
                ? "border-b-2 border-primary text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {item.label}
            {item.id === "applications" ? ` (${applications.length})` : null}
            {item.id === "waitlist" ? ` (${waitlist.length})` : null}
            {item.id === "payments" ? ` (${payments.length})` : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <section className="grid gap-4 lg:grid-cols-[240px_1fr]">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="h-40 w-full rounded-xl object-cover lg:h-full" />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-sm text-text-hint">
                No cover
              </div>
            )}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-lg font-semibold">{row.title}</h2>
              <p className="mt-1 text-sm text-text-secondary">
                {[row.organizer, row.location, row.country].filter(Boolean).join(" · ") || "-"}
              </p>
              <p className="mt-3 text-sm text-text-secondary line-clamp-4">{row.description}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <StatusBadge tone={row.is_published ? "success" : "warning"}>
                  {row.is_published ? "Published" : "Draft"}
                </StatusBadge>
                <StatusBadge tone={opportunityStatusTone(row.status)}>
                  {opportunityStatusLabel(row.status)}
                </StatusBadge>
                <span className="rounded-md border border-border px-2 py-1">
                  {formatOpportunityFee(row.fee_type, row.fee_amount)}
                </span>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Applicants" value={`${overview?.applicant_count ?? revenue?.total_applicants ?? 0}`} />
            <Stat label="Review queue" value={`${overview?.review_queue ?? 0}`} hint="submitted / under review / shortlisted" />
            <Stat label="Interest waitlist" value={`${overview?.waitlist_count ?? waitlist.length}`} />
            <Stat
              label="Verified fee collections"
              value={`${overview?.currency || "ETB"} ${Number(overview?.verified_collections || revenue?.total_collected || 0).toLocaleString()}`}
              hint="Customer fees - not platform commission"
            />
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">Schedule (Africa/Addis_Ababa)</h3>
            <ul className="grid gap-2 text-sm text-text-secondary sm:grid-cols-2">
              <li>
                Applications open:{" "}
                {overview?.applications_open_at
                  ? formatDateTime(overview.applications_open_at)
                  : "-"}
              </li>
              <li>
                Deadline:{" "}
                {overview?.application_deadline
                  ? formatDateTime(overview.application_deadline)
                  : "-"}
              </li>
              <li>
                Event / trial:{" "}
                {[overview?.event_start, overview?.event_end]
                  .filter(Boolean)
                  .map((d) => formatDate(d!))
                  .join(" → ") || "-"}
              </li>
              <li>
                Capacity:{" "}
                {overview?.capacity != null
                  ? `${overview.applicant_count ?? 0} / ${overview.capacity} (${overview.capacity_remaining ?? 0} left)`
                  : "Unlimited"}
              </li>
            </ul>
            {(overview?.scheduling_issues?.length || 0) > 0 ||
            (overview?.config_missing?.length || 0) > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {(overview?.scheduling_issues ?? []).map((i) => (
                  <p key={i}>Schedule: {i}</p>
                ))}
                {(overview?.config_missing ?? []).map((i) => (
                  <p key={i}>Missing: {i}</p>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-emerald-800">No scheduling or configuration issues detected.</p>
            )}
            <p className="mt-3 text-[11px] text-text-hint">
              {overview?.waitlist_definition ||
                "Waitlist = interest before applications open. Never auto-converts to applications."}
            </p>
            {overview?.next_scheduled_transition ? (
              <p className="mt-2 text-xs text-text-secondary">
                Next transition: {overview.next_scheduled_transition.label}
                {overview.next_scheduled_transition.at
                  ? ` · ${formatDateTime(overview.next_scheduled_transition.at)}`
                  : ""}
              </p>
            ) : (
              <p className="mt-2 text-xs text-text-hint">No pending scheduled open/close.</p>
            )}
            {lastScheduleRun ? (
              <p className="mt-1 text-[11px] text-text-hint">
                Last Process schedules:{" "}
                {lastScheduleRun.created_at
                  ? formatDateTime(lastScheduleRun.created_at)
                  : "-"}
                {lastScheduleRun.summary ? ` - ${lastScheduleRun.summary}` : ""}
                {lastScheduleRun.admin_name ? ` · ${lastScheduleRun.admin_name}` : ""}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-text-hint">
                No Process schedules audit entry yet (cron or admin button).
              </p>
            )}
            <p className="mt-1 text-[11px] text-text-hint">
              {overview?.schedule_timezone_note ||
                "Timestamps stored in UTC; display uses Africa/Addis_Ababa."}{" "}
              Terms version: {overview?.terms_version ?? 1}. Closing applications preserves
              applications and payments (not the same as cancelling the listing).
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">Recent activity</h3>
            {audit.length === 0 ? (
              <p className="text-sm text-text-hint">No audit events for this opportunity yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {audit.slice(0, 20).map((entry, idx) => (
                  <li
                    key={`${entry.created_at}-${entry.action}-${idx}`}
                    className="border-b border-border/60 pb-2 last:border-0"
                  >
                    <p className="font-medium text-text-primary">
                      {entry.summary || entry.action || "Event"}
                    </p>
                    <p className="text-[11px] text-text-hint">
                      {[
                        entry.created_at ? formatDateTime(entry.created_at) : null,
                        entry.admin_name,
                        entry.outcome,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === "applications" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <AdminTableShell>
            {applications.length === 0 ? (
              <AdminEmpty title="No applications" description="Applicants will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3">Ref</th>
                      <th className="px-4 py-3">Applicant</th>
                      <th className="px-4 py-3">Submitted</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app) => (
                      <tr
                        key={app.id}
                        className={cn(
                          "border-b border-border last:border-0",
                          selectedAppId === app.id && "bg-secondary/40",
                        )}
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {app.reference || `APP-${app.id.slice(0, 8).toUpperCase()}`}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={app.people_href || `/admin/people/${app.users?.id || app.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {app.users?.display_name || app.users?.username || "Applicant"}
                          </Link>
                          <p className="text-[11px] text-text-hint">
                            {app.users?.role || "-"} · profile {app.profile_completion_percent}%
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">
                          {app.submitted_at
                            ? formatDateTime(app.submitted_at)
                            : formatDateTime(app.created_at)}
                        </td>
                        <td className="px-4 py-3 text-xs">{payLabel(app)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={applicationTone(app.status)}>
                            {applicationStatusLabel(app.status)}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => writeParams({ app: app.id, tab: "applications" })}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Open application
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminTableShell>

          <aside className="rounded-xl border border-border bg-card p-4 shadow-sm">
            {!selectedApp ? (
              <p className="text-sm text-text-hint">Select an application to review.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-text-hint">
                      {selectedApp.reference || selectedApp.id.slice(0, 8)}
                    </p>
                    <Link
                      href={
                        selectedApp.people_href ||
                        `/admin/people/${selectedApp.users?.id}`
                      }
                      className="font-semibold text-primary hover:underline"
                    >
                      {selectedApp.users?.display_name || "Applicant"}
                    </Link>
                    <p className="text-xs text-text-hint">
                      Also available at legacy `/admin/users/[id]` via People redirects where configured.
                    </p>
                  </div>
                  <StatusBadge tone={applicationTone(selectedApp.status)}>
                    {applicationStatusLabel(selectedApp.status)}
                  </StatusBadge>
                </div>
                <p className="text-xs text-text-secondary">
                  Submitted{" "}
                  {selectedApp.submitted_at
                    ? formatDateTime(selectedApp.submitted_at)
                    : formatDateTime(selectedApp.created_at)}
                </p>
                <p>
                  <span className="text-text-hint">Payment:</span> {payLabel(selectedApp)}
                  {selectedApp.amount_paid
                    ? ` · ETB ${Number(selectedApp.amount_paid).toLocaleString()}`
                    : ""}
                  {selectedApp.provider_ref ? (
                    <span className="block font-mono text-[11px] text-text-hint">
                      Provider: {selectedApp.provider_ref}
                    </span>
                  ) : null}
                </p>
                {selectedApp.fee_snapshot ? (
                  <div className="rounded-lg border border-border p-2 text-xs">
                    <p className="font-medium text-text-hint">Quoted fee at submission</p>
                    <p>
                      {selectedApp.fee_snapshot.fee_type === "paid"
                        ? `${selectedApp.fee_snapshot.currency || "ETB"} ${selectedApp.fee_snapshot.fee_amount}`
                        : "Not required - free opportunity"}
                      {selectedApp.fee_snapshot.quoted_at
                        ? ` · ${formatDateTime(selectedApp.fee_snapshot.quoted_at)}`
                        : ""}
                    </p>
                  </div>
                ) : null}
                {selectedApp.profile_snapshot ? (
                  <p className="text-xs text-text-secondary">
                    Profile at submission:{" "}
                    {selectedApp.profile_snapshot.profile_completion_percent ?? "-"}%
                    {selectedApp.users?.email ? ` · ${selectedApp.users.email}` : ""}
                  </p>
                ) : null}
                <div>
                  <p className="text-xs font-medium text-text-hint">Message / answers</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-xs">
                    {selectedApp.message || "-"}
                  </p>
                </div>
                {(() => {
                  const publicAnswers = Object.fromEntries(
                    Object.entries(selectedApp.extra_answers || {}).filter(
                      ([k]) => !k.startsWith("_"),
                    ),
                  );
                  if (Object.keys(publicAnswers).length === 0) return null;
                  return (
                    <div>
                      <p className="text-xs font-medium text-text-hint">Submitted answers</p>
                      <pre className="mt-1 overflow-auto rounded-lg bg-muted/40 p-2 text-[11px]">
                        {JSON.stringify(publicAnswers, null, 2)}
                      </pre>
                    </div>
                  );
                })()}
                <div>
                  <p className="text-xs font-medium text-text-hint">
                    Required documents (terms v
                    {selectedApp.terms_snapshot?.terms_version ?? overview?.terms_version ?? 1})
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {selectedApp.terms_snapshot?.required_documents ||
                      row.required_documents ||
                      "None configured. Uploaded applicant files require authorized access (secure download not wired in this view)."}
                  </p>
                </div>
                {(selectedApp.decision_history?.length || 0) > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-text-hint">Decision history</p>
                    <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-[11px]">
                      {selectedApp.decision_history!.map((d, i) => (
                        <li key={`${d.at}-${i}`} className="rounded bg-muted/40 p-1.5">
                          <span className="font-medium">
                            {d.from} → {d.to}
                          </span>
                          {d.at ? ` · ${formatDateTime(d.at)}` : ""}
                          {d.reason ? <span className="block">Reason: {d.reason}</span> : null}
                          {d.internal_note ? (
                            <span className="block text-text-hint">
                              Internal: {d.internal_note}
                            </span>
                          ) : null}
                          {d.applicant_message ? (
                            <span className="block">Applicant msg: {d.applicant_message}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="text-xs text-text-hint">
                  Internal notes (not shown as applicant-facing unless you notify):
                </p>
                <textarea
                  className={areaClass}
                  rows={2}
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  placeholder="Staff-only note"
                />
                <textarea
                  className={areaClass}
                  rows={2}
                  value={applicantFacing}
                  onChange={(e) => setApplicantFacing(e.target.value)}
                  placeholder="Optional applicant-facing explanation (stored separately tagged)"
                />
                {selectedApp.admin_note ? (
                  <p className="whitespace-pre-wrap rounded-lg border border-border p-2 text-[11px] text-text-secondary">
                    Prior notes: {selectedApp.admin_note}
                  </p>
                ) : null}
                {canWrite ? (
                  <div className="flex flex-wrap gap-2">
                    {(
                      selectedApp.allowed_transitions ||
                      APPLICATION_TRANSITIONS[selectedApp.status] ||
                      []
                    ).map((next) => (
                      <button
                        key={next}
                        type="button"
                        disabled={busyAppId === selectedApp.id}
                        onClick={() => void reviewApp(selectedApp, next, false)}
                        className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {applicationActionLabel(next)}
                      </button>
                    ))}
                    {(
                      selectedApp.allowed_transitions ||
                      APPLICATION_TRANSITIONS[selectedApp.status] ||
                      []
                    ).includes("accepted") ? (
                      <button
                        type="button"
                        disabled={busyAppId === selectedApp.id}
                        onClick={() => void reviewApp(selectedApp, "accepted", true)}
                        className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                      >
                        Accept + notify
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <p className="text-[11px] text-text-hint">
                  Decisions require authorized reviewers. Rejection and withdrawal require a reason.
                  Profile completion is informational - not used to auto-rank or reject.
                </p>
              </div>
            )}
          </aside>
        </div>
      ) : null}

      {tab === "waitlist" ? (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            {overview?.waitlist_definition ||
              "Interest before applications open. Not a capacity overflow list. Entries never auto-become applications."}
          </p>
          <AdminTableShell>
            {waitlist.length === 0 ? (
              <AdminEmpty
                title="No waitlist entries"
                description="Users who tap Notify me while applications are closed appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Related application</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitlist.map((w) => (
                      <tr key={w.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <Link
                            href={w.people_href || `/admin/people/${w.user_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {w.users?.display_name || w.user_id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">
                          {formatDateTime(w.created_at)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {w.state_label ||
                            (w.notified_at ? "Notified" : "Waiting for open")}
                          {w.notified_at ? (
                            <span className="block text-text-hint">
                              {formatDateTime(w.notified_at)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {w.related_application_id ? (
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() =>
                                writeParams({
                                  tab: "applications",
                                  app: w.related_application_id!,
                                })
                              }
                            >
                              {w.related_application_status || "View"}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminTableShell>
        </div>
      ) : null}

      {tab === "payments" ? (
        <AdminTableShell>
          {row.fee_type === "free" ? (
            <AdminEmpty
              title="Free opportunity"
              description="No application fee is required. Payment-completion warnings do not apply."
            />
          ) : payments.length === 0 ? (
            <AdminEmpty title="No payments" description="Verified and pending fee attempts appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Provider ref</th>
                    <th className="px-4 py-3">Paid at</th>
                    <th className="px-4 py-3">Finance</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 tabular-nums">
                        {p.currency || "ETB"} {Number(p.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {p.label ||
                          opportunityPaymentLabel("paid", p.status)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {p.provider_ref || "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {p.paid_at ? formatDateTime(p.paid_at) : formatDateTime(p.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {p.finance_href ? (
                          <Link
                            href={p.finance_href}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Open transaction
                          </Link>
                        ) : (
                          <Link
                            href={`/admin/finance/transactions?module=opportunity&q=${p.id}`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Find in Finance
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminTableShell>
      ) : null}

      {tab === "settings" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {canWrite ? (
              <>
                <button
                  type="button"
                  disabled={saving || !dirty}
                  onClick={() => void save()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  disabled={saving || !dirty}
                  onClick={cancelEdit}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : null}
          </div>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-heading text-sm font-semibold">Basic information</h2>
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
              <Field
                label="Organizer"
                hint="Free-text organizer. Link to Organizations records when available in a later pass."
              >
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
              <Field label="Description" className="sm:col-span-2">
                <textarea
                  className={areaClass}
                  rows={4}
                  disabled={!canWrite}
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </Field>
              <Field
                label="External URL"
                hint="Must start with http:// or https://"
                className="sm:col-span-2"
              >
                <input
                  className={fieldClass}
                  disabled={!canWrite}
                  value={draft.external_link}
                  onChange={(e) => setDraft((d) => ({ ...d, external_link: e.target.value }))}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-heading text-sm font-semibold">Media</h2>
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="mb-3 h-40 w-full max-w-md rounded-xl object-cover" />
            ) : null}
            {canWrite ? (
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadCover(file);
                }}
                className="block w-full text-sm"
              />
            ) : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-heading text-sm font-semibold">Schedule and capacity</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Event start">
                <input
                  className={fieldClass}
                  type="date"
                  value={draft.start_date}
                  disabled={!canWrite}
                  onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
                />
              </Field>
              <Field label="Event end">
                <input
                  className={fieldClass}
                  type="date"
                  value={draft.end_date}
                  disabled={!canWrite}
                  onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                />
              </Field>
              <Field label="Applications open at">
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
              <Field
                label="Max applicants"
                hint="Reducing capacity does not remove existing applicants."
              >
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  disabled={!canWrite}
                  value={draft.max_applicants}
                  onChange={(e) => setDraft((d) => ({ ...d, max_applicants: e.target.value }))}
                  placeholder="Unlimited"
                />
              </Field>
              <Field
                label="Allow multiple applications"
                hint="When off, a user with a non-withdrawn application cannot apply again (enforced atomically with capacity)."
              >
                <label className="flex h-10 items-center gap-2 text-sm">
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
                  />
                  Allowed
                </label>
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-heading text-sm font-semibold">Fees</h2>
            <div className="grid gap-3 sm:grid-cols-2">
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
              <Field
                label="Fee amount (ETB)"
                hint="Changing fee does not rewrite historical payment amounts."
              >
                <input
                  className={fieldClass}
                  type="number"
                  min={0}
                  disabled={!canWrite || draft.fee_type !== "paid"}
                  value={draft.fee_amount}
                  onChange={(e) => setDraft((d) => ({ ...d, fee_amount: e.target.value }))}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-heading text-sm font-semibold">Eligibility and required information</h2>
            <p className="mb-3 text-xs text-text-hint">
              Eligible roles gate who can apply in the app. Empty selection means all roles.
              Profile-completion % is a soft gate at apply time - it does not auto-rank or reject
              in admin review. Editing terms here bumps terms_version; already-submitted
              applications keep their snapshot.
            </p>
            <Field
              label="Eligible roles"
              hint="Empty = all roles. Profile-completeness % is separate from identity verification."
            >
              <div className="flex flex-wrap gap-2">
                {ELIGIBLE_ROLE_OPTIONS.map((role) => {
                  const on = draft.eligible_roles.includes(role.value);
                  return (
                    <button
                      key={role.value}
                      type="button"
                      disabled={!canWrite}
                      onClick={() =>
                        setDraft((prev) => {
                          const set = new Set(prev.eligible_roles);
                          if (set.has(role.value)) set.delete(role.value);
                          else set.add(role.value);
                          return { ...prev, eligible_roles: [...set] };
                        })
                      }
                      className={`rounded-md border px-2 py-1 text-xs disabled:opacity-50 ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card"
                      }`}
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Min profile completion %">
                <input
                  className={fieldClass}
                  type="number"
                  min={0}
                  max={100}
                  disabled={!canWrite}
                  value={draft.min_profile_completion}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, min_profile_completion: e.target.value }))
                  }
                />
              </Field>
            </div>
            <div className="mt-3 space-y-3">
              <Field label="Eligibility requirements">
                <textarea
                  className={areaClass}
                  rows={3}
                  disabled={!canWrite}
                  value={draft.eligibility_requirements}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, eligibility_requirements: e.target.value }))
                  }
                />
              </Field>
              <Field label="Required documents / information">
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
              <Field label="Additional terms">
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
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-heading text-sm font-semibold">Publication</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Application status">
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
              <Field label="Visibility">
                <label className="flex h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={!canWrite}
                    checked={draft.is_published}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, is_published: e.target.checked }))
                    }
                  />
                  Published (visible in app)
                </label>
              </Field>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-hint">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-text-hint">{hint}</p> : null}
    </div>
  );
}
