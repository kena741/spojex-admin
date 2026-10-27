"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { fetchIdentityCatalog } from "@/lib/identity-catalog";
import { patchAdmin, postAdmin, putAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import {
  VERIFICATION_STEPS,
  type IdentityDocumentType,
  type VerificationRequirement,
  verificationStepLabel,
} from "@/lib/verification-docs";

type CatalogPayload = {
  types: IdentityDocumentType[];
  requirements: Array<
    | VerificationRequirement
    | {
        id?: string;
        role_slug?: string;
        document_type_id?: string;
        is_required?: boolean;
        description?: string;
        sort_order?: number;
        identity_document_types?: IdentityDocumentType | null;
      }
  >;
  fromDatabase?: boolean;
};

type RoleOption = { slug: string; label: string; group: string };

type DraftReq = {
  document_type_id: string;
  slug: string;
  label: string;
  is_required: boolean;
  description: string;
  sort_order: number;
};

type Props = {
  /** When true, omit page chrome (used inside Verification Center). */
  embedded?: boolean;
};

export default function VerificationRequirementsEditor({ embedded = false }: Props) {
  const { can } = useAdminPermissions();
  const canWrite = can("profiles:write");
  const [types, setTypes] = useState<IdentityDocumentType[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [selectedRole, setSelectedRole] = useState("athlete");
  const [draftReqs, setDraftReqs] = useState<DraftReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fromDatabase, setFromDatabase] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [newType, setNewType] = useState({
    slug: "",
    label: "",
    description: "",
    step: "role_evidence" as "identity" | "role_evidence",
  });

  const load = async (role = selectedRole) => {
    const [catalogRes, identity] = await Promise.all([
      fetch(`/api/admin/verification-docs?role=${encodeURIComponent(role)}`, {
        credentials: "same-origin",
      }),
      fetchIdentityCatalog(),
    ]);
    const payload = (await catalogRes.json()) as { error?: string; data?: CatalogPayload };
    if (!catalogRes.ok) throw new Error(payload.error || "Failed to load document catalog");

    const nextTypes = payload.data?.types ?? [];
    setTypes(nextTypes);
    setFromDatabase(payload.data?.fromDatabase !== false);

    const roles = identity.roles
      .filter((item) => item.is_active)
      .map((item) => ({
        slug: item.slug,
        label: item.label,
        group: item.identity_role_groups?.label ?? "",
      }));
    setRoleOptions(roles);
    if (!roles.some((item) => item.slug === role) && roles[0]) {
      setSelectedRole(roles[0].slug);
    }

    const raw = payload.data?.requirements ?? [];
    const mapped: DraftReq[] = raw.map((item, index) => {
      const asReq = item as Record<string, unknown>;
      const slug = typeof asReq.slug === "string" ? asReq.slug : "";
      const label = typeof asReq.label === "string" ? asReq.label : "";
      if (slug && label) {
        const type = nextTypes.find((t) => t.slug === slug);
        const hint =
          (typeof asReq.requirement_description === "string"
            ? asReq.requirement_description
            : "") ||
          (typeof asReq.description === "string" ? asReq.description : "");
        return {
          document_type_id: type?.id ?? slug,
          slug,
          label,
          is_required: Boolean(asReq.is_required),
          description: hint,
          sort_order: typeof asReq.sort_order === "number" ? asReq.sort_order : (index + 1) * 10,
        };
      }
      const embeddedType = asReq.identity_document_types as IdentityDocumentType | null | undefined;
      return {
        document_type_id:
          (typeof asReq.document_type_id === "string" ? asReq.document_type_id : "") ||
          embeddedType?.id ||
          "",
        slug: embeddedType?.slug || "",
        label: embeddedType?.label || "Document",
        is_required: Boolean(asReq.is_required),
        description: typeof asReq.description === "string" ? asReq.description : "",
        sort_order: typeof asReq.sort_order === "number" ? asReq.sort_order : (index + 1) * 10,
      };
    });
    setDraftReqs(mapped.filter((item) => item.document_type_id));
    setDirty(false);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const availableTypes = useMemo(() => {
    const used = new Set(draftReqs.map((item) => item.document_type_id));
    return types.filter((item) => item.is_active && !used.has(item.id));
  }, [types, draftReqs]);

  const changeRole = async (role: string) => {
    if (dirty && !window.confirm("Discard unsaved requirement changes for this role?")) return;
    setSelectedRole(role);
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await load(role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load role requirements");
    } finally {
      setLoading(false);
    }
  };

  const createType = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await postAdmin("/api/admin/verification-docs", {
        slug: newType.slug.trim(),
        label: newType.label.trim(),
        description: newType.description.trim(),
        step: newType.step,
      });
      setNewType({ slug: "", label: "", description: "", step: "role_evidence" });
      await load(selectedRole);
      setNotice("Document type created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleTypeActive = async (type: IdentityDocumentType) => {
    if (!canWrite) return;
    const nextActive = !type.is_active;
    if (
      !nextActive &&
      !window.confirm(
        `Deactivate “${type.label}”? New submissions will not require it. Historical evidence stays on past requests.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchAdmin("/api/admin/verification-docs", {
        id: type.id,
        is_active: nextActive,
      });
      await load(selectedRole);
      setNotice(nextActive ? "Document type activated." : "Document type deactivated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const addRequirement = (typeId: string) => {
    const type = types.find((item) => item.id === typeId);
    if (!type) return;
    if (draftReqs.some((item) => item.document_type_id === type.id)) {
      setError("This document type is already assigned to the role.");
      return;
    }
    setDraftReqs((prev) => [
      ...prev,
      {
        document_type_id: type.id,
        slug: type.slug,
        label: type.label,
        is_required: true,
        description: type.description,
        sort_order: (prev.length + 1) * 10,
      },
    ]);
    setDirty(true);
  };

  const saveRequirements = async () => {
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await putAdmin("/api/admin/verification-docs/requirements", {
        role_slug: selectedRole,
        requirements: draftReqs.map((item, index) => ({
          document_type_id: item.document_type_id,
          is_required: item.is_required,
          description: item.description,
          sort_order: item.sort_order || (index + 1) * 10,
        })),
      });
      await load(selectedRole);
      setNotice(`Saved requirements for ${selectedRole}. Policy version applies to new submissions only.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const cancelDraft = async () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setLoading(true);
    try {
      await load(selectedRole);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reload failed");
    } finally {
      setLoading(false);
    }
  };

  const seedCatalog = async () => {
    if (!canWrite) return;
    if (
      !window.confirm(
        "Initialize the identity document catalog with default types and role requirements? This only runs when the catalog is empty.",
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/verifications/catalog/seed", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const payload = (await res.json()) as { error?: string; types_inserted?: number };
      if (!res.ok) throw new Error(payload.error || "Seed failed");
      await load(selectedRole);
      setNotice(
        `Catalog initialized (${payload.types_inserted ?? 0} document types). Edit before treating as production policy.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading && types.length === 0) {
    return <AdminLoadingRow label="Loading verification document catalog…" />;
  }

  return (
    <div className={embedded ? "space-y-6" : ""}>
      {error ? (
        <div className="space-y-2">
          <AdminErrorAlert message={error} />
          <button
            type="button"
            onClick={() => {
              setError(null);
              setLoading(true);
              load(selectedRole)
                .catch((err) => setError(err instanceof Error ? err.message : "Retry failed"))
                .finally(() => setLoading(false));
            }}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Retry
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {!fromDatabase ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Catalog tables are missing or unreachable. Showing client fallbacks for reference only -
          they are not enforced until the live catalog is initialized.
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-text-secondary">
        This editor configures <strong className="font-medium text-foreground">identity / role
        document</strong> requirements only. Organization verification and gym/venue verification
        use separate workflows and badges.
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {VERIFICATION_STEPS.map((step) => (
          <div key={step.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold">{step.label}</p>
            <p className="mt-1 text-sm text-text-secondary">{step.blurb}</p>
          </div>
        ))}
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Document types</h2>
          {canWrite && fromDatabase && types.length === 0 ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void seedCatalog()}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Initialize catalog defaults
            </button>
          ) : null}
        </div>

        {types.length === 0 ? (
          <AdminEmpty
            title="No document types configured"
            description={
              fromDatabase
                ? "The identity document catalog is empty. Initialize defaults explicitly, or add types manually. Nothing is enforced until configured."
                : "Could not load document types from the database."
            }
          />
        ) : (
          <AdminTableShell>
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Label</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Step</th>
                  <th className="px-4 py-3 font-medium">Active</th>
                  {canWrite ? <th className="px-4 py-3 font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {types.map((type) => (
                  <tr key={type.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-medium">{type.label}</p>
                      <p className="text-xs text-text-secondary">{type.description || "-"}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{type.slug}</td>
                    <td className="px-4 py-3">{verificationStepLabel(type.step)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={type.is_active ? "success" : "neutral"}>
                        {type.is_active ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={saving || !fromDatabase}
                          onClick={() => toggleTypeActive(type)}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                        >
                          {type.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableShell>
        )}

        {canWrite && fromDatabase ? (
          <form
            onSubmit={createType}
            className="mt-4 grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2"
          >
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Label</span>
              <input
                value={newType.label}
                onChange={(event) => setNewType((prev) => ({ ...prev, label: event.target.value }))}
                className="rounded-lg border border-border px-3 py-2"
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Slug</span>
              <input
                value={newType.slug}
                onChange={(event) => setNewType((prev) => ({ ...prev, slug: event.target.value }))}
                className="rounded-lg border border-border px-3 py-2 font-mono text-xs"
                placeholder="press_credential"
                required
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="text-text-secondary">Description / instructions</span>
              <input
                value={newType.description}
                onChange={(event) =>
                  setNewType((prev) => ({ ...prev, description: event.target.value }))
                }
                className="rounded-lg border border-border px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Step</span>
              <select
                value={newType.step}
                onChange={(event) =>
                  setNewType((prev) => ({
                    ...prev,
                    step: event.target.value as "identity" | "role_evidence",
                  }))
                }
                className="rounded-lg border border-border px-3 py-2"
              >
                {VERIFICATION_STEPS.map((step) => (
                  <option key={step.id} value={step.id}>
                    {step.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Add document type
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Role requirements</h2>
            <p className="text-sm text-text-secondary">
              Required and optional document types per identity role. Changes apply to new
              submissions; approved requests keep their prior policy outcome.
            </p>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Role</span>
            <select
              value={selectedRole}
              onChange={(event) => changeRole(event.target.value)}
              className="min-w-56 rounded-lg border border-border px-3 py-2"
            >
              {roleOptions.map((role) => (
                <option key={role.slug} value={role.slug}>
                  {role.group ? `${role.group} · ${role.label}` : role.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {draftReqs.length === 0 ? (
          <AdminEmpty
            title="No requirements for this role"
            description={
              types.length === 0
                ? "Configure document types first, then assign them to this role."
                : "This role has no configured upload requirements in the live catalog."
            }
          />
        ) : (
          <div className="mb-4 space-y-3">
            {draftReqs.map((req, index) => (
              <div
                key={`${req.document_type_id}-${index}`}
                className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="font-medium">{req.label}</p>
                  <p className="text-xs text-text-secondary font-mono">{req.slug}</p>
                  <input
                    value={req.description}
                    onChange={(event) => {
                      setDraftReqs((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, description: event.target.value } : item,
                        ),
                      );
                      setDirty(true);
                    }}
                    disabled={!canWrite}
                    className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm"
                    placeholder="Requirement hint shown to the applicant"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={req.is_required}
                    disabled={!canWrite}
                    onChange={(event) => {
                      setDraftReqs((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, is_required: event.target.checked } : item,
                        ),
                      );
                      setDirty(true);
                    }}
                  />
                  Required
                </label>
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftReqs((prev) => prev.filter((_, i) => i !== index));
                      setDirty(true);
                    }}
                    className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {canWrite && fromDatabase && types.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <select
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) {
                  addRequirement(event.target.value);
                  event.target.value = "";
                }
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              <option value="">Add document type…</option>
              {availableTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {verificationStepLabel(type.step)} · {type.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void saveRequirements()}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void cancelDraft()}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            {dirty ? (
              <span className="text-xs text-amber-800">Unsaved changes</span>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
