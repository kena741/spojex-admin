"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { patchAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { IdentityVerificationRequestRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { verificationDocLabel, verificationStatusLabel } from "@/lib/verification";
import { verificationStepLabel } from "@/lib/verification-docs";

export default function VerificationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { can } = useAdminPermissions();
  const canVerify = can("users:verify");
  const [row, setRow] = useState<IdentityVerificationRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = async () => {
    const response = await fetch(`/api/admin/verifications/${id}`, { credentials: "same-origin" });
    const payload = (await response.json()) as {
      error?: string;
      data?: IdentityVerificationRequestRow;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load");
    setRow(payload.data ?? null);
    setNote(payload.data?.review_note ?? "");
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const review = async (status: "approved" | "rejected") => {
    if (!canVerify) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(`/api/admin/verifications/${id}`, {
        status,
        review_note: note.trim(),
      });
      await load();
      setNotice(status === "approved" ? "User verified." : "Request rejected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setSaving(false);
    }
  };

  const docs = row?.identity_verification_documents ?? [];
  const uploadedKinds = useMemo(() => new Set(docs.map((doc) => doc.kind)), [docs]);
  const requirements = row?.role_requirements ?? [];
  const missingRequired = requirements.filter(
    (item) => item.is_required && !uploadedKinds.has(item.slug),
  );

  if (loading) return <AdminLoadingRow label="Loading documents…" />;
  if (!row) return <AdminErrorAlert message={error || "Request not found"} />;

  const person = row.users;

  return (
    <>
      <AdminPageHeader
        title={person?.display_name || "Verification"}
        description="Role-based identity and evidence documents"
        backHref="/admin/verifications"
        breadcrumbs={[
          { label: "Verifications", href: "/admin/verifications" },
          { label: person?.display_name || "Detail" },
        ]}
        actions={
          canVerify && row.status === "pending" ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => review("rejected")}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => review("approved")}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Approve
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

      <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {person ? (
              <Link href={`/admin/users/${person.id}`} className="font-medium text-primary hover:underline">
                {person.display_name || person.full_name || "User"}
              </Link>
            ) : (
              <p className="font-medium">Unknown user</p>
            )}
            <p className="mt-1 text-sm text-text-secondary">
              {person?.role || "No role"} · submitted {formatDate(row.created_at)}
            </p>
          </div>
          <StatusBadge tone={requestTone(row.status)}>{verificationStatusLabel(row.status)}</StatusBadge>
        </div>
        {canVerify ? (
          <label className="mt-4 grid gap-1 text-sm">
            <span className="text-text-secondary">Review note</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="rounded-lg border border-border px-3 py-2 text-sm"
              placeholder="Optional note for this decision"
            />
          </label>
        ) : null}
        {row.review_note && row.status !== "pending" ? (
          <p className="mt-3 text-sm text-text-secondary">Decision note: {row.review_note}</p>
        ) : null}
      </div>

      {requirements.length > 0 ? (
        <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Required for role · {person?.role || "—"}</h2>
            <Link href="/admin/verification-docs" className="text-xs font-medium text-primary hover:underline">
              Manage document types
            </Link>
          </div>
          {missingRequired.length > 0 ? (
            <p className="mb-3 text-sm text-amber-800">
              Missing required uploads: {missingRequired.map((item) => item.label).join(", ")}
            </p>
          ) : (
            <p className="mb-3 text-sm text-emerald-800">All required document types were uploaded.</p>
          )}
          <ul className="grid gap-2 md:grid-cols-2">
            {requirements.map((item) => {
              const uploaded = uploadedKinds.has(item.slug);
              return (
                <li
                  key={item.slug}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {item.label}
                      {item.is_required ? " *" : ""}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {verificationStepLabel(item.step)}
                      {item.requirement_description ? ` · ${item.requirement_description}` : ""}
                    </p>
                  </div>
                  <StatusBadge tone={uploaded ? "success" : item.is_required ? "warning" : "neutral"}>
                    {uploaded ? "Uploaded" : item.is_required ? "Missing" : "Optional"}
                  </StatusBadge>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {docs.length === 0 ? (
        <AdminErrorAlert message="No documents were uploaded with this request." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {docs.map((doc) => (
            <figure key={doc.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <figcaption className="border-b border-border px-4 py-2 text-sm font-medium">
                {verificationDocLabel(doc.kind, doc.label)}
              </figcaption>
              {doc.mime_type?.startsWith("image/") && doc.signed_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={doc.signed_url}
                  alt={verificationDocLabel(doc.kind, doc.label)}
                  className="h-72 w-full object-contain bg-muted"
                />
              ) : doc.signed_url ? (
                <a
                  href={doc.signed_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block px-4 py-8 text-center text-sm text-primary hover:underline"
                >
                  Open document
                </a>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-text-secondary">
                  Could not create a preview URL.
                </p>
              )}
            </figure>
          ))}
        </div>
      )}
    </>
  );
}
