"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { StatusBadge } from "@/components/status-badge";
import { adminFetch, deleteAdmin, postAdmin, uploadAdmin } from "@/lib/hooks";
import {
  ELIGIBLE_ROLE_OPTIONS,
  emptyOpportunityDraft,
  formatOpportunityFee,
  opportunityStatusLabel,
  opportunityStatuses,
  opportunityStatusTone,
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

export default function OpportunitiesPage() {
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("opportunities:write");
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [revenue, setRevenue] = useState<Record<string, OpportunityRevenue>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [published, setPublished] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<OpportunityDraft>(emptyOpportunityDraft());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    const response = await adminFetch("/api/admin/opportunities");
    const payload = (await response.json()) as {
      data?: OpportunityRow[];
      revenue?: Record<string, OpportunityRevenue>;
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load");
    setRows(payload.data ?? []);
    setRevenue(payload.revenue ?? {});
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (published === "yes" && !row.is_published) return false;
      if (published === "no" && row.is_published) return false;
      if (!q) return true;
      return [row.title, row.category, row.organizer, row.location, row.country]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [published, query, rows, status]);

  const totals = useMemo(() => {
    let applicants = 0;
    let waitlist = 0;
    let collected = 0;
    for (const row of filtered) {
      const stats = revenue[row.id];
      applicants += stats?.total_applicants ?? row.applicant_count ?? 0;
      waitlist += stats?.waitlist_count ?? row.waitlist_count ?? 0;
      collected += stats?.total_collected ?? 0;
    }
    return { collected, applicants, waitlist };
  }, [filtered, revenue]);

  const openCreate = () => {
    setDraft(emptyOpportunityDraft());
    setModalOpen(true);
    setError(null);
  };

  const uploadCover = async (file: File) => {
    if (!canWrite) return;
    setUploading(true);
    setError(null);
    try {
      const payload = await uploadAdmin("/api/admin/opportunities/upload", file);
      const url = typeof payload.image_url === "string" ? payload.image_url : "";
      if (!url) throw new Error("Upload did not return an image URL");
      setDraft((prev) => ({ ...prev, cover_image_url: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!canWrite) return;
    if (!draft.title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = (await postAdmin(
        "/api/admin/opportunities",
        draft as unknown as Record<string, unknown>,
      )) as { id?: string } | null;
      await load();
      setModalOpen(false);
      if (created?.id) router.push(`/admin/opportunities/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!canWrite) return;
    if (!window.confirm(`Delete “${title}” and its applications? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await deleteAdmin(`/api/admin/opportunities/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const processSchedules = async () => {
    if (!canWrite) return;
    setProcessing(true);
    setError(null);
    try {
      await postAdmin("/api/admin/opportunities/process-schedules", {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Schedule processing failed");
    } finally {
      setProcessing(false);
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

  return (
    <>
      <AdminPageHeader
        title="Opportunities"
        description={`${filtered.length} of ${rows.length} · ${totals.applicants} applicants · ${totals.waitlist} waitlisted`}
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={processSchedules}
                disabled={processing}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {processing ? "Processing…" : "Process schedules"}
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                New opportunity
              </button>
            </div>
          ) : null
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <AdminStatCard title="Opportunities" value={`${filtered.length}`} />
        <AdminStatCard title="Applicants" value={`${totals.applicants}`} />
        <div className="col-span-2 lg:col-span-1">
          <AdminStatCard
            title="Fee revenue"
            value={`ETB ${totals.collected.toLocaleString()}`}
          />
        </div>
      </section>

      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_160px_160px]">
          <AdminSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search title, category, organizer, location"
          />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            {opportunityStatuses.map((item) => (
              <option key={item} value={item}>
                {opportunityStatusLabel(item)}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={published} onChange={setPublished}>
            <option value="all">All visibility</option>
            <option value="yes">Published</option>
            <option value="no">Drafts</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>

      {loading ? <AdminLoadingRow label="Loading opportunities…" /> : null}

      <AdminTableShell>
        {!loading && filtered.length === 0 ? (
          <AdminEmpty
            title={rows.length === 0 ? "No opportunities yet" : "No matching opportunities"}
            description={
              rows.length === 0
                ? "Create a trial, job, or scouting listing to get started."
                : "Try a different search or filter."
            }
          />
        ) : !loading ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Opportunity</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Fee</th>
                  <th className="px-4 py-3 font-semibold">Applicants</th>
                  <th className="px-4 py-3 font-semibold">Waitlist</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const cover = row.cover_image_url?.trim() || "";
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover}
                              alt=""
                              className="h-11 w-16 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <div className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-text-secondary">
                              No img
                            </div>
                          )}
                          <div className="min-w-0">
                            <Link
                              href={`/admin/opportunities/${row.id}`}
                              className="font-medium text-text-primary hover:text-primary"
                            >
                              {row.title}
                            </Link>
                            <p className="truncate text-xs text-text-secondary">
                              {[row.category, row.organizer || row.location]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                              {row.is_published ? "" : " · Draft"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <StatusBadge tone={opportunityStatusTone(row.status)}>
                            {opportunityStatusLabel(row.status)}
                          </StatusBadge>
                          {!row.is_published ? (
                            <StatusBadge tone="warning">Draft</StatusBadge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatOpportunityFee(row.fee_type, row.fee_amount)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {revenue[row.id]?.total_applicants ?? row.applicant_count ?? 0}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {revenue[row.id]?.waitlist_count ?? row.waitlist_count ?? 0}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDate(row.updated_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-3">
                          <Link
                            href={`/admin/opportunities/${row.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            Manage
                          </Link>
                          {canWrite ? (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => remove(row.id, row.title)}
                              className="text-sm text-red-600 hover:underline disabled:opacity-50"
                            >
                              Delete
                            </button>
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
        open={modalOpen}
        onClose={() => {
          if (saving) return;
          setModalOpen(false);
        }}
        title="New opportunity"
        className="max-w-2xl"
        footer={
          <AdminModalFooter
            onCancel={() => setModalOpen(false)}
            onSave={save}
            saving={saving}
            saveLabel="Create"
          />
        }
      >
        <div className="space-y-5">
          <FormSection title="Basics">
            <Field label="Title">
              <input
                className={fieldClass}
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="e.g. Under-17 academy trial"
              />
            </Field>
            <Field label="Cover image">
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
              {uploading ? (
                <p className="mt-1 text-xs text-text-secondary">Uploading…</p>
              ) : (
                <p className="mt-1 text-xs text-text-secondary">JPG, PNG, WebP, or GIF</p>
              )}
              {draft.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.cover_image_url}
                  alt=""
                  className="mt-2 h-32 w-full rounded-xl object-cover"
                />
              ) : (
                <div className="mt-2 flex h-28 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-sm text-text-secondary">
                  No cover yet
                </div>
              )}
            </Field>
            <Field label="Description">
              <textarea
                className={areaClass}
                rows={4}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category / type">
                <input
                  className={fieldClass}
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  placeholder="Trial, Scholarship, Job…"
                />
              </Field>
              <Field label="Organizer">
                <input
                  className={fieldClass}
                  value={draft.organizer}
                  onChange={(e) => setDraft((d) => ({ ...d, organizer: e.target.value }))}
                />
              </Field>
              <Field label="Location">
                <input
                  className={fieldClass}
                  value={draft.location}
                  onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                />
              </Field>
              <Field label="Country">
                <input
                  className={fieldClass}
                  value={draft.country}
                  onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value }))}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Status & schedule">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status">
                <select
                  className={fieldClass}
                  value={draft.status}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      status: e.target.value as OpportunityDraft["status"],
                    }))
                  }
                >
                  {opportunityStatuses.map((item) => (
                    <option key={item} value={item}>
                      {opportunityStatusLabel(item)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Min profile completion %">
                <input
                  className={fieldClass}
                  type="number"
                  min={0}
                  max={100}
                  value={draft.min_profile_completion}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, min_profile_completion: e.target.value }))
                  }
                />
              </Field>
              <Field label="Application opens">
                <input
                  className={fieldClass}
                  type="datetime-local"
                  value={draft.application_opens_at}
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
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, application_deadline: e.target.value }))
                  }
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Fees">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fee">
                <select
                  className={fieldClass}
                  value={draft.fee_type}
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
                  disabled={draft.fee_type !== "paid"}
                  value={draft.fee_amount}
                  onChange={(e) => setDraft((d) => ({ ...d, fee_amount: e.target.value }))}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Eligibility">
            <Field label="Eligibility requirements">
              <textarea
                className={areaClass}
                rows={3}
                value={draft.eligibility_requirements}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, eligibility_requirements: e.target.value }))
                }
              />
            </Field>
            <Field label="Required information / documents">
              <textarea
                className={areaClass}
                rows={2}
                value={draft.required_documents}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, required_documents: e.target.value }))
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
                      onClick={() => toggleRole(role.value)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={draft.is_published}
                onChange={(e) => setDraft((d) => ({ ...d, is_published: e.target.checked }))}
                className="rounded border-border text-primary focus:ring-primary/20"
              />
              Publish immediately
            </label>
          </FormSection>
        </div>
      </AdminModal>
    </>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-heading text-sm font-semibold text-text-primary">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-text-primary">{label}</span>
      {children}
    </label>
  );
}
