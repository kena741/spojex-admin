"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminSearchInput,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { patchAdmin } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { IdentityVerificationRequestRow } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { verificationDocLabel, verificationStatusLabel } from "@/lib/verification";
import { verificationStepLabel } from "@/lib/verification-docs";

/** Map UI filters to backend statuses (no inventing states). */
const QUEUE_FILTERS = [
  { id: "pending", label: "Pending", status: "pending" },
  { id: "in_review", label: "In Review", status: "pending" }, // same status; sorted by age / docs
  { id: "approved", label: "Approved", status: "approved" },
  { id: "rejected", label: "Rejected", status: "rejected" },
] as const;

function requestAgeHours(createdAt: string) {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (Date.now() - t) / 36e5);
}

export default function VerificationCenterPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canVerify = can("users:verify");
  const canReadDocs = can("profiles:read");

  const tab = searchParams.get("tab") || "queue";
  const statusFilter = searchParams.get("status") || "pending";
  const selectedId = searchParams.get("id") || "";

  const [rows, setRows] = useState<IdentityVerificationRequestRow[]>([]);
  const [selected, setSelected] = useState<IdentityVerificationRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

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

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: loadError } = await getSpojexClient()
        .from("identity_verification_requests")
        .select(
          "*, users!identity_verification_requests_user_id_fkey(id, display_name, full_name, role, avatar_url, verified)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (loadError) throw loadError;
      setRows((data ?? []) as IdentityVerificationRequestRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = QUEUE_FILTERS.find((f) => f.id === statusFilter) ?? QUEUE_FILTERS[0];
    let list = rows.filter((row) => row.status === filter.status);
    if (statusFilter === "in_review") {
      // Pending requests older than 24h or already touched — still backend "pending"
      list = list.filter((row) => requestAgeHours(row.created_at) >= 24 || Boolean(row.notes));
    } else if (statusFilter === "pending") {
      list = list.filter((row) => requestAgeHours(row.created_at) < 24 && !row.notes);
    }
    if (q) {
      list = list.filter((row) => {
        const person = row.users;
        return [person?.display_name, person?.full_name, person?.role, row.user_id]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      });
    }
    return list;
  }, [query, rows, statusFilter]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/verifications/${id}`, { credentials: "same-origin" });
      const payload = (await response.json()) as {
        error?: string;
        data?: IdentityVerificationRequestRow;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to load request");
      setSelected(payload.data ?? null);
      setNote(payload.data?.review_note ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load request");
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "queue") return;
    if (selectedId) {
      void loadDetail(selectedId);
      return;
    }
    setSelected(null);
  }, [selectedId, tab, loadDetail]);

  const review = async (status: "approved" | "rejected" | "pending") => {
    if (!canVerify || !selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(`/api/admin/verifications/${selected.id}`, {
        status,
        review_note: note.trim(),
      });
      setNotice(
        status === "approved"
          ? "Approved."
          : status === "rejected"
            ? "Rejected."
            : "Additional information requested (note saved; status remains pending).",
      );
      await loadQueue();
      await loadDetail(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setSaving(false);
    }
  };

  const docs = selected?.identity_verification_documents ?? [];
  const uploadedKinds = useMemo(() => new Set(docs.map((doc) => doc.kind)), [docs]);
  const requirements = selected?.role_requirements ?? [];
  const missingRequired = requirements.filter(
    (item) => item.is_required && !uploadedKinds.has(item.slug),
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Verification Center"
        description="Review identity requests and document requirements in one place"
        actions={
          canReadDocs ? (
            <button
              type="button"
              onClick={() => writeParams({ tab: tab === "requirements" ? "queue" : "requirements", id: null })}
              className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-text-secondary hover:text-foreground"
            >
              {tab === "requirements" ? "Back to queue" : "Document requirements"}
            </button>
          ) : null
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      {tab === "requirements" ? (
        <RequirementsEmbed />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {QUEUE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => writeParams({ status: f.id, id: null })}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium",
                  statusFilter === f.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-text-secondary hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
            {/* Queue */}
            <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border p-3">
                <AdminSearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Search queue…"
                />
              </div>
              {loading ? <AdminLoadingRow label="Loading queue…" /> : null}
              {!loading && filtered.length === 0 ? (
                <AdminEmpty title="Empty queue" description="No requests in this filter." />
              ) : (
                <ul className="flex-1 overflow-y-auto divide-y divide-border">
                  {filtered.map((row) => {
                    const person = row.users;
                    const age = requestAgeHours(row.created_at);
                    const active = selectedId === row.id;
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => writeParams({ id: row.id })}
                          className={cn(
                            "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40",
                            active && "bg-secondary/70",
                          )}
                        >
                          <UserAvatar
                            name={person?.display_name || person?.full_name}
                            src={person?.avatar_url}
                            size={36}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {person?.display_name || person?.full_name || "Unknown"}
                            </p>
                            <p className="truncate text-[11px] text-text-secondary">
                              {person?.role || "—"} · {formatDate(row.created_at)}
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                              <StatusBadge tone={requestTone(row.status)}>
                                {verificationStatusLabel(row.status)}
                              </StatusBadge>
                              <span className="text-[10px] text-text-hint">
                                {age < 24 ? `${Math.round(age)}h` : `${Math.round(age / 24)}d`} old
                              </span>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Detail */}
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              {detailLoading ? <AdminLoadingRow label="Loading request…" /> : null}
              {!detailLoading && !selected ? (
                <div className="grid h-full place-items-center p-8 text-sm text-text-hint">
                  Select a request from the queue
                </div>
              ) : null}
              {!detailLoading && selected ? (
                <div className="max-h-[78vh] overflow-y-auto p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      {selected.users ? (
                        <Link
                          href={`/admin/people/${selected.users.id}`}
                          className="font-heading text-base font-semibold text-primary hover:underline"
                        >
                          {selected.users.display_name || selected.users.full_name}
                        </Link>
                      ) : (
                        <p className="font-heading text-base font-semibold">Unknown user</p>
                      )}
                      <p className="mt-1 text-xs text-text-secondary">
                        {selected.users?.role || "No role"} · submitted{" "}
                        {formatDate(selected.created_at)}
                      </p>
                    </div>
                    <StatusBadge tone={requestTone(selected.status)}>
                      {verificationStatusLabel(selected.status)}
                    </StatusBadge>
                  </div>

                  {canVerify && selected.status === "pending" ? (
                    <div className="mb-4 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                      <label className="grid gap-1 text-sm">
                        <span className="text-text-secondary">Decision note</span>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={2}
                          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                          placeholder="Reason for approval, rejection, or follow-up"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saving || !note.trim()}
                          onClick={() => void review("pending")}
                          className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                        >
                          Request more info
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void review("rejected")}
                          className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void review("approved")}
                          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                        >
                          Approve
                        </button>
                      </div>
                      <p className="text-[11px] text-text-hint">
                        “Request more info” keeps status pending and stores your note for the
                        applicant / In Review queue.
                      </p>
                    </div>
                  ) : null}

                  {selected.review_note && selected.status !== "pending" ? (
                    <p className="mb-4 text-sm text-text-secondary">
                      Decision note: {selected.review_note}
                      {selected.reviewed_at ? ` · ${formatDate(selected.reviewed_at)}` : ""}
                    </p>
                  ) : null}

                  {requirements.length > 0 ? (
                    <div className="mb-4">
                      <h3 className="mb-2 text-sm font-semibold">Checklist</h3>
                      {missingRequired.length > 0 ? (
                        <p className="mb-2 text-xs text-amber-800">
                          Missing: {missingRequired.map((item) => item.label).join(", ")}
                        </p>
                      ) : (
                        <p className="mb-2 text-xs text-emerald-800">All required types uploaded.</p>
                      )}
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {requirements.map((item) => {
                          const uploaded = uploadedKinds.has(item.slug);
                          return (
                            <li
                              key={item.slug}
                              className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                            >
                              <div>
                                <p className="font-medium">
                                  {item.label}
                                  {item.is_required ? " *" : ""}
                                </p>
                                <p className="text-text-hint">{verificationStepLabel(item.step)}</p>
                              </div>
                              <StatusBadge
                                tone={uploaded ? "success" : item.is_required ? "warning" : "neutral"}
                              >
                                {uploaded ? "OK" : item.is_required ? "Missing" : "Optional"}
                              </StatusBadge>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  <h3 className="mb-2 text-sm font-semibold">Documents</h3>
                  {docs.length === 0 ? (
                    <p className="text-sm text-text-hint">No documents on this request.</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {docs.map((doc) => (
                        <figure
                          key={doc.id}
                          className="overflow-hidden rounded-lg border border-border bg-muted/20"
                        >
                          <figcaption className="border-b border-border px-3 py-1.5 text-xs font-medium">
                            {verificationDocLabel(doc.kind, doc.label)}
                          </figcaption>
                          {doc.mime_type?.startsWith("image/") && doc.signed_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={doc.signed_url}
                              alt={verificationDocLabel(doc.kind, doc.label)}
                              className="h-56 w-full object-contain bg-muted"
                            />
                          ) : doc.signed_url ? (
                            <a
                              href={doc.signed_url}
                              target="_blank"
                              rel="noreferrer"
                              className="block px-3 py-6 text-center text-sm text-primary hover:underline"
                            >
                              Open document
                            </a>
                          ) : (
                            <p className="px-3 py-6 text-center text-xs text-text-hint">
                              Preview unavailable
                            </p>
                          )}
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function RequirementsEmbed() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="font-heading text-sm font-semibold">Document requirements</h2>
      <p className="mt-2 max-w-xl text-sm text-text-secondary">
        Configure which identity documents each customer profile type must upload. This stays under
        Verification Center but uses the existing requirements editor.
      </p>
      <Link
        href="/admin/verification-docs"
        className="mt-4 inline-flex rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
      >
        Open requirements editor
      </Link>
    </div>
  );
}
