"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminReloadButton,
} from "@/components/admin-layout";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import {
  catalogRequest,
  INPUT_TYPE_LABELS,
  newId,
  optionValue,
  SCOPE_LABELS,
  slugify,
  type CatalogCheck,
  type CatalogDocument,
  type CatalogField,
  type CatalogOverview,
  type CatalogProfession,
  type CatalogSection,
  type CatalogSport,
  type CatalogVersionDetail,
  type CatalogVersionRow,
} from "@/lib/profile-catalog";
import { cn } from "@/lib/utils";

type Tab = "categories" | "fields" | "sections" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "fields", label: "Tabs" },
  { id: "categories", label: "Roles" },
  { id: "sections", label: "Sections" },
  { id: "history", label: "Versions" },
];

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary disabled:opacity-60";
const buttonClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        status === "active" || status === "published"
          ? "bg-emerald-500/10 text-emerald-600"
          : status === "draft"
            ? "bg-amber-500/10 text-amber-600"
            : "bg-muted text-text-secondary",
      )}
    >
      {status}
    </span>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-text-hint">{hint}</span> : null}
    </label>
  );
}

/** Swap sort_order with the neighbour inside [rows] (already sorted). */
function reorder<T extends { id: string; sort_order: number }>(all: T[], rows: T[], id: string, dir: -1 | 1): T[] {
  const idx = rows.findIndex((r) => r.id === id);
  const other = rows[idx + dir];
  if (idx < 0 || !other) return all;
  const a = rows[idx];
  const aOrder = a.sort_order === other.sort_order ? other.sort_order + dir : other.sort_order;
  return all.map((r) =>
    r.id === a.id ? { ...r, sort_order: aOrder } : r.id === other.id ? { ...r, sort_order: a.sort_order } : r,
  );
}

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

export default function ProfileConfigPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("profile_catalog:write");
  const canPublish = can("profile_catalog:publish");
  const [tab, setTab] = useState<Tab>("fields");
  const [overview, setOverview] = useState<CatalogOverview | null>(null);
  const [draft, setDraft] = useState<CatalogVersionRow | null>(null);
  const [doc, setDoc] = useState<CatalogDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [check, setCheck] = useState<CatalogCheck | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState("");
  const [versionDetail, setVersionDetail] = useState<CatalogVersionDetail | null>(null);
  const [versionDetailLoading, setVersionDetailLoading] = useState(false);
  const [editingField, setEditingField] = useState<CatalogField | null>(null);
  const [editingCategory, setEditingCategory] = useState<
    { kind: "sports" | "professions"; row: CatalogSport | CatalogProfession } | null
  >(null);

  const load = useCallback(async (preferDraftId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await catalogRequest<CatalogOverview>("");
      setOverview(data);
      const drafts = data.versions.filter((v) => v.status === "draft");
      const open =
        (preferDraftId ? drafts.find((v) => v.id === preferDraftId) : null) ??
        drafts[0] ??
        null;
      if (open) {
        const full = await catalogRequest<CatalogVersionRow>(`/drafts/${open.id}`);
        setDraft(full);
        setDoc(full.document ?? null);
      } else {
        setDraft(null);
        setDoc(data.live);
      }
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load profile configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const editable = Boolean(draft && canWrite);
  const usage = overview?.usage ?? {};
  const liveIds = useMemo(() => {
    const live = overview?.live;
    if (!live) return new Set<string>();
    return new Set([...live.fields, ...live.sports, ...live.professions].map((r) => r.id));
  }, [overview]);

  const update = (fn: (d: CatalogDocument) => CatalogDocument) => {
    if (!doc || !editable) return;
    setDoc(fn(doc));
    setDirty(true);
    setCheck(null);
  };

  const startDraft = async (fromVersionId?: string) => {
    if (dirty && !window.confirm("Discard unsaved draft edits and start from this version?")) return;
    const otherDrafts = (overview?.versions ?? []).filter(
      (v) => v.status === "draft" && v.id !== fromVersionId,
    );
    if (
      fromVersionId &&
      otherDrafts.length > 0 &&
      !window.confirm(
        `You already have ${otherDrafts.length} open draft(s). Create another from this version? You can delete unused drafts in Versions.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await catalogRequest<CatalogVersionRow>("/drafts", {
        method: "POST",
        body: JSON.stringify(fromVersionId ? { from_version_id: fromVersionId } : {}),
      });
      setDraft(created);
      setDoc(created.document ?? null);
      setDirty(false);
      setCheck(null);
      setTab("fields");
      setNotice(
        fromVersionId
          ? `Editing a new draft forked from the selected version (based on live v${created.base_version}).`
          : `Draft started from version ${created.base_version}.`,
      );
      await load(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a draft");
    } finally {
      setBusy(false);
    }
  };

  const openVersion = async (row: CatalogVersionRow) => {
    if (row.status === "draft") {
      if (dirty && draft?.id !== row.id && !window.confirm("Switch drafts? Unsaved edits will be lost.")) return;
      setBusy(true);
      setError(null);
      try {
        const full = await catalogRequest<CatalogVersionRow>(`/drafts/${row.id}`);
        setDraft(full);
        setDoc(full.document ?? null);
        setDirty(false);
        setCheck(null);
        setTab("fields");
        setNotice("Opened draft for editing.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open draft");
      } finally {
        setBusy(false);
      }
      return;
    }
    // Published / superseded → fork into a new editable draft.
    await startDraft(row.id);
  };

  const deleteVersion = async (row: CatalogVersionRow) => {
    if (row.status === "published") {
      setError("The live published catalog can't be deleted. Publish a newer version first.");
      return;
    }
    const label = row.version ? `v${row.version}` : `draft from v${row.base_version}`;
    if (
      !window.confirm(
        row.status === "draft"
          ? `Delete ${label}? Unpublished changes are lost.`
          : `Remove superseded ${label} from history? This cannot be undone from the admin UI.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await catalogRequest(`/versions/${row.id}`, { method: "DELETE" });
      if (draft?.id === row.id) {
        setDraft(null);
        setDoc(null);
        setDirty(false);
        setCheck(null);
      }
      setNotice(row.status === "draft" ? "Draft deleted." : `Superseded ${label} removed.`);
      await load(draft?.id === row.id ? null : draft?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete version");
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!draft || !doc) return false;
    setBusy(true);
    setError(null);
    try {
      const saved = await catalogRequest<CatalogVersionRow>(`/drafts/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({ document: doc, expected_updated_at: draft.updated_at }),
      });
      setDraft(saved);
      if (saved.document) setDoc(saved.document);
      setDirty(false);
      setNotice("Draft saved.");
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      // Optimistic lock: server draft moved (Validate/heal, another tab, or another admin).
      if (/reload it before saving|draft_conflict|someone else saved/i.test(message)) {
        try {
          const full = await catalogRequest<CatalogVersionRow>(`/drafts/${draft.id}`);
          setDraft(full);
          setDoc(full.document ?? null);
          setDirty(false);
          setError("Draft was updated on the server. Reloaded — re-apply your edits, then Save.");
          return false;
        } catch {
          /* fall through */
        }
      }
      setError(message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const validate = async () => {
    if (!draft) return null;
    if (dirty && !(await saveDraft())) return null;
    setBusy(true);
    try {
      const result = await catalogRequest<CatalogCheck & CatalogVersionRow>(
        `/drafts/${draft.id}/validate`,
        { method: "POST", body: "{}" },
      );
      // Server heals hard-removed live fields as archived — refresh local draft + updated_at.
      if (result.document) {
        setDoc(result.document);
        setDraft({
          ...draft,
          ...result,
          document: result.document,
        });
        setDirty(false);
      } else {
        const full = await catalogRequest<CatalogVersionRow>(`/drafts/${draft.id}`);
        setDraft(full);
        setDoc(full.document ?? null);
        setDirty(false);
      }
      setCheck(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!draft || !window.confirm("Discard this draft? Unpublished changes are lost.")) return;
    setBusy(true);
    try {
      await catalogRequest(`/drafts/${draft.id}`, { method: "DELETE" });
      setNotice("Draft discarded.");
      setCheck(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discard failed");
    } finally {
      setBusy(false);
    }
  };

  const openPublish = async () => {
    const result = await validate();
    if (result) {
      setPublishTitle((draft?.title || draft?.notes || "").trim());
      setPublishOpen(true);
    }
  };

  const publish = async () => {
    if (!draft) return;
    const title = publishTitle.trim();
    if (!title) {
      setError("Give this version a short title before publishing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await catalogRequest<{ version: number; recomputed_profiles: number }>(
        `/drafts/${draft.id}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            confirm: true,
            expected_base_version: draft.base_version,
            title,
          }),
        },
      );
      setPublishOpen(false);
      setCheck(null);
      setNotice(`Published v${out.version} “${title}”. ${out.recomputed_profiles} profiles had their completion updated.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  };

  const openVersionDetail = async (row: CatalogVersionRow) => {
    setVersionDetailLoading(true);
    setError(null);
    try {
      const detail = await catalogRequest<CatalogVersionDetail>(`/versions/${row.id}`);
      setVersionDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load version details");
    } finally {
      setVersionDetailLoading(false);
    }
  };

  const renameVersion = async (row: CatalogVersionRow, title: string) => {
    setBusy(true);
    setError(null);
    try {
      await catalogRequest(`/versions/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setNotice("Version title saved.");
      if (versionDetail?.id === row.id) {
        setVersionDetail({ ...versionDetail, title, notes: title });
      }
      await load(draft?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save title");
    } finally {
      setBusy(false);
    }
  };

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <AdminReloadButton onClick={() => void load()} refreshing={loading} />
      {draft ? (
        <>
          <button type="button" className={buttonClass} disabled={!canWrite || busy || !dirty} onClick={() => void saveDraft()}>
            {dirty ? "Save draft" : "Saved"}
          </button>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void validate()}>
            Validate
          </button>
          <button type="button" className={buttonClass} disabled={!canWrite || busy} onClick={() => void discard()}>
            Discard
          </button>
          <button type="button" className={primaryButtonClass} disabled={!canPublish || busy} onClick={() => void openPublish()}>
            Review & publish
          </button>
        </>
      ) : (
        <button type="button" className={primaryButtonClass} disabled={!canWrite || busy} onClick={() => void startDraft()}>
          <Plus className="h-4 w-4" /> Start draft
        </button>
      )}
    </div>
  );

  return (
    <div>
      <AdminPageHeader
        title="Profile Configuration"
        description={
          overview
            ? `Live catalog v${overview.live.version}${draft ? ` · editing draft based on v${draft.base_version}` : " · read-only (start a draft to edit)"}`
            : "Sports, professions, profile fields, and sections"
        }
        actions={headerActions}
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-text-secondary">
          {notice}
          <button type="button" className="ml-2 underline" onClick={() => setNotice(null)}>
            dismiss
          </button>
        </div>
      ) : null}
      {check ? <CheckPanel check={check} /> : null}

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              tab === t.id ? "border-primary font-semibold text-text-primary" : "border-transparent text-text-secondary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !doc ? <AdminLoadingRow label="Loading profile configuration…" /> : null}
      {doc && overview ? (
        <>
          {tab === "categories" ? (
            <CategoriesTab
              doc={doc}
              editable={editable}
              usage={usage}
              onEdit={(kind, row) => setEditingCategory({ kind, row })}
              onChange={update}
            />
          ) : null}
          {tab === "fields" ? (
            <FieldsTab
              doc={doc}
              editable={editable}
              usage={usage}
              liveIds={liveIds}
              onEdit={setEditingField}
              onChange={update}
            />
          ) : null}
          {tab === "sections" ? <SectionsTab doc={doc} editable={editable} onChange={update} /> : null}
          {tab === "history" ? (
            <HistoryTab
              versions={overview.versions}
              activeDraftId={draft?.id ?? null}
              canWrite={canWrite}
              busy={busy || versionDetailLoading}
              onOpenDetail={(v) => void openVersionDetail(v)}
              onEdit={(v) => void openVersion(v)}
              onDelete={(v) => void deleteVersion(v)}
              onRename={(v, title) => void renameVersion(v, title)}
            />
          ) : null}
        </>
      ) : null}

      {editingField && doc ? (
        <FieldEditor
          field={editingField}
          doc={doc}
          isNew={!liveIds.has(editingField.id)}
          usage={usage[editingField.id] ?? 0}
          inputTypes={overview?.input_types ?? {}}
          onClose={() => setEditingField(null)}
          onSave={(next) => {
            update((d) => ({
              ...d,
              fields: d.fields.some((f) => f.id === next.id)
                ? d.fields.map((f) => (f.id === next.id ? next : f))
                : [...d.fields, next],
            }));
            setEditingField(null);
          }}
        />
      ) : null}
      {editingCategory ? (
        <CategoryEditor
          kind={editingCategory.kind}
          row={editingCategory.row}
          isNew={!liveIds.has(editingCategory.row.id)}
          onClose={() => setEditingCategory(null)}
          onSave={(next) => {
            const kind = editingCategory.kind;
            update((d) => {
              const rows = d[kind] as (CatalogSport | CatalogProfession)[];
              const merged = rows.some((r) => r.id === next.id)
                ? rows.map((r) => (r.id === next.id ? next : r))
                : [...rows, next];
              return { ...d, [kind]: merged } as CatalogDocument;
            });
            setEditingCategory(null);
          }}
        />
      ) : null}
      <AdminModal
        open={publishOpen && Boolean(check)}
        title="Review impact before publishing"
        onClose={() => setPublishOpen(false)}
        className="max-w-2xl"
        footer={
          <AdminModalFooter
            onCancel={() => setPublishOpen(false)}
            onSave={() => void publish()}
            saving={busy}
            disabled={!check?.ok || !publishTitle.trim()}
            saveLabel={check?.ok ? "Publish" : "Fix errors first"}
          />
        }
      >
        <div className="mb-4 space-y-1">
          <label className="block text-xs font-medium text-text-secondary">Version title</label>
          <input
            className={inputClass}
            value={publishTitle}
            maxLength={200}
            placeholder="e.g. Media tab fields + football highlights"
            onChange={(e) => setPublishTitle(e.target.value)}
          />
          <p className="text-xs text-text-hint">Shown in Versions history so you can tell publishes apart.</p>
        </div>
        {check ? <ImpactSummary check={check} /> : null}
      </AdminModal>
      <AdminModal
        open={Boolean(versionDetail)}
        title={
          versionDetail
            ? versionDetail.version
              ? `v${versionDetail.version}${versionDetail.title ? ` — ${versionDetail.title}` : ""}`
              : `Draft${versionDetail.title ? ` — ${versionDetail.title}` : ""}`
            : "Version"
        }
        onClose={() => setVersionDetail(null)}
        className="max-w-2xl"
        footer={
          versionDetail ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className={buttonClass}
                onClick={() => setVersionDetail(null)}
              >
                Close
              </button>
              <button
                type="button"
                className={primaryButtonClass}
                disabled={!canWrite || busy}
                onClick={() => {
                  const row = versionDetail;
                  setVersionDetail(null);
                  void openVersion(row);
                }}
              >
                {versionDetail.status === "draft" ? "Open draft" : "Edit as new draft"}
              </button>
            </div>
          ) : null
        }
      >
        {versionDetail ? <VersionDetailBody detail={versionDetail} canWrite={canWrite} onRename={renameVersion} /> : null}
      </AdminModal>
    </div>
  );
}

function CheckPanel({ check }: { check: CatalogCheck }) {
  return (
    <div
      className={cn(
        "mb-4 rounded-lg border px-4 py-3 text-sm",
        check.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5",
      )}
    >
      <p className="font-medium text-text-primary">
        {check.ok ? "Draft is valid." : `${check.errors.length} error(s) must be fixed before publishing.`}{" "}
        {check.impact.change_count} change(s)
        {check.impact.profiles_needing_update
          ? ` · ${check.impact.profiles_needing_update} complete profile(s) will be asked to update`
          : ""}
      </p>
      {[...check.errors.map((e) => ({ ...e, level: "error" })), ...check.warnings.map((w) => ({ ...w, level: "warning" }))].map(
        (issue, i) => (
          <p key={i} className={cn("mt-1 text-xs", issue.level === "error" ? "text-red-600" : "text-amber-600")}>
            {issue.level === "error" ? "Error" : "Warning"}: {issue.message}{" "}
            <span className="text-text-hint">({issue.path})</span>
          </p>
        ),
      )}
    </div>
  );
}

function ImpactSummary({ check }: { check: CatalogCheck }) {
  return (
    <div className="space-y-3 text-sm">
      <CheckPanel check={check} />
      {check.impact.changes.length === 0 ? <p className="text-text-secondary">No changes compared to the live catalog.</p> : null}
      <ul className="space-y-2">
        {check.impact.changes.map((c) => (
          <li key={`${c.kind}-${c.id}`} className="rounded-lg border border-border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase text-text-hint">{c.kind}</span>
              <span className="font-medium">{c.name}</span>
              <StatusPill status={c.change} />
              {c.newly_required ? <StatusPill status="newly required" /> : null}
              <span className="ml-auto text-xs text-text-secondary">{c.usage} saved answer(s)</span>
            </div>
            {c.fields_changed?.length ? (
              <p className="mt-1 text-xs text-text-secondary">Changed: {c.fields_changed.join(", ")}</p>
            ) : null}
            {c.note ? <p className="mt-1 text-xs text-text-secondary">{c.note}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoriesTab({
  doc,
  editable,
  usage,
  onEdit,
  onChange,
}: {
  doc: CatalogDocument;
  editable: boolean;
  usage: Record<string, number>;
  onEdit: (kind: "sports" | "professions", row: CatalogSport | CatalogProfession) => void;
  onChange: (fn: (d: CatalogDocument) => CatalogDocument) => void;
}) {
  const block = (kind: "sports" | "professions", title: string) => {
    const rows = [...(doc[kind] as (CatalogSport | CatalogProfession)[])].sort(bySort);
    return (
      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-heading text-sm font-semibold">{title}</h2>
          <button
            type="button"
            className={buttonClass}
            disabled={!editable}
            onClick={() =>
              onEdit(kind, {
                id: newId(),
                slug: "",
                label: "",
                profile_title: "",
                description: "",
                sort_order: (rows.at(-1)?.sort_order ?? 0) + 10,
                status: "active",
                ...(kind === "professions" ? { license_label: "", default_service_category_slug: "" } : {}),
              } as CatalogProfession)
            }
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const fieldCount = doc.fields.filter((f) => f.scope_ref === row.slug && f.status === "active").length;
            const answers = doc.fields
              .filter((f) => f.scope_ref === row.slug)
              .reduce((n, f) => n + (usage[f.id] ?? 0), 0);
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {row.label} <span className="text-xs text-text-hint">({row.slug})</span>
                  </p>
                  <p className="text-xs text-text-secondary">
                    Title “{row.profile_title || row.label}” · {fieldCount} field(s) · {answers} saved answer(s)
                    {"license_label" in row && row.license_label ? ` · ${row.license_label}` : ""}
                  </p>
                </div>
                <StatusPill status={row.status} />
                <button type="button" className={buttonClass} disabled={!editable} onClick={() => onEdit(kind, row)}>
                  Edit
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!editable}
                  title={row.status === "active" ? "Archive: hidden for new profiles, kept on existing ones" : "Restore"}
                  onClick={() =>
                    onChange((d) => ({
                      ...d,
                      [kind]: (d[kind] as CatalogSport[]).map((r) =>
                        r.id === row.id ? { ...r, status: r.status === "active" ? "archived" : "active" } : r,
                      ),
                    }) as CatalogDocument)
                  }
                >
                  {row.status === "active" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {block("sports", "Athlete · sports")}
      {block("professions", "Professional · roles")}
    </div>
  );
}

function scopeKey(f: Pick<CatalogField, "scope_kind" | "scope_ref">) {
  return f.scope_ref ? `${f.scope_kind}:${f.scope_ref}` : f.scope_kind;
}

/** Portfolio Me tab — single section (legacy clips/photos/links still recognized). */
const PORTFOLIO_SECTION_KEYS = new Set(["portfolio", "clips", "photos", "links"]);
const LEGACY_PORTFOLIO_SECTION_KEYS = new Set(["clips", "photos", "links"]);
const COMMON_FIELD_SCOPES = new Set(["account", "fan", "athlete", "professional"]);

/** Overview keys that must live under one canonical scope (no cross-scope clones). */
const CANONICAL_FIELD_SCOPE: Record<string, CatalogField["scope_kind"]> = {
  display_name: "account",
  bio: "account",
  country: "account",
  city: "account",
  date_of_birth: "athlete",
  nationality: "athlete",
  looking_for_opportunities: "athlete",
  organization: "professional",
  specializations: "professional",
  regions: "professional",
  license: "professional",
  certified: "professional",
  license_document: "professional",
};

type FieldsBucket = "overview" | "career" | "achievements" | "media" | "portfolio";

function fieldBucket(f: CatalogField): FieldsBucket {
  if (f.section === "career" || f.target === "career") return "career";
  if (f.section === "achievements" || f.target === "achievement") return "achievements";
  // Media tab (highlights / gallery) — same label as mobile Me → Media.
  if (f.section === "media" || f.target === "media") return "media";
  if (
    PORTFOLIO_SECTION_KEYS.has(f.section ?? "") ||
    f.target === "clip" ||
    f.target === "photo" ||
    f.target === "link" ||
    f.target === "portfolio" ||
    f.scope_kind === "sport" ||
    f.scope_kind === "profession"
  ) {
    return "portfolio";
  }
  return "overview";
}

function fieldIdentity(f: CatalogField) {
  return `${f.scope_kind}:${f.scope_ref ?? ""}:${f.target}:${f.key}`;
}

function preferField(a: CatalogField, b: CatalogField) {
  const score = (f: CatalogField) =>
    (f.status === "active" ? 8 : 0) +
    (f.storage_column ? 4 : 0) +
    (f.is_system ? 2 : 0) +
    (CANONICAL_FIELD_SCOPE[f.key] === f.scope_kind ? 1 : 0);
  return score(a) >= score(b) ? a : b;
}

/** Drop cross-scope clones and exact identity duplicates. */
function dedupeFields(list: CatalogField[]) {
  const byIdentity = new Map<string, CatalogField>();
  for (const f of list) {
    const id = fieldIdentity(f);
    const prev = byIdentity.get(id);
    byIdentity.set(id, prev ? preferField(f, prev) : f);
  }
  const byKey = new Map<string, CatalogField>();
  for (const f of byIdentity.values()) {
    const canonical = CANONICAL_FIELD_SCOPE[f.key];
    if (!canonical || f.target !== "profile" || !COMMON_FIELD_SCOPES.has(f.scope_kind)) {
      byKey.set(`${fieldIdentity(f)}`, f);
      continue;
    }
    const prev = byKey.get(f.key);
    if (!prev) {
      byKey.set(f.key, f);
      continue;
    }
    byKey.set(f.key, preferField(f.scope_kind === canonical ? f : prev, prev.scope_kind === canonical ? prev : f));
  }
  return [...byKey.values()];
}

function scopeLabel(doc: CatalogDocument, f: CatalogField) {
  if (f.scope_kind === "sport") {
    const sport = doc.sports.find((s) => s.slug === f.scope_ref);
    return sport ? `Athlete · ${sport.label}` : `Athlete · ${f.scope_ref}`;
  }
  if (f.scope_kind === "profession") {
    const profession = doc.professions.find((p) => p.slug === f.scope_ref);
    return profession ? `Professional · ${profession.label}` : `Professional · ${f.scope_ref}`;
  }
  return SCOPE_LABELS[f.scope_kind] ?? f.scope_kind;
}

const SHARED_ENTITY_BUCKETS = new Set<FieldsBucket>(["overview", "career", "achievements", "media"]);

function sharedBucketCloneIds(fields: CatalogField[], field: CatalogField): string[] {
  /** Same key under different common scopes within Overview / Career / Achievements / Media. */
  const bucket = fieldBucket(field);
  if (!SHARED_ENTITY_BUCKETS.has(bucket)) return [field.id];
  return fields
    .filter(
      (f) =>
        fieldBucket(f) === bucket &&
        f.key === field.key &&
        f.target === field.target &&
        COMMON_FIELD_SCOPES.has(f.scope_kind),
    )
    .map((f) => f.id);
}

function preferSharedField(a: CatalogField, b: CatalogField) {
  const score = (f: CatalogField) =>
    (f.status === "active" ? 8 : 0) +
    (f.scope_kind === "account" ? 4 : 0) +
    (f.is_system ? 2 : 0) +
    (f.storage_column ? 1 : 0);
  return score(a) >= score(b) ? a : b;
}

/** Keep one active copy per key within a shared Tabs bucket. */
function dedupeSharedBucket(list: CatalogField[]) {
  const byKey = new Map<string, CatalogField>();
  for (const f of list) {
    const prev = byKey.get(f.key);
    byKey.set(f.key, prev ? preferSharedField(f, prev) : f);
  }
  return [...byKey.values()];
}

function FieldsTab({
  doc,
  editable,
  usage,
  liveIds,
  onEdit,
  onChange,
}: {
  doc: CatalogDocument;
  editable: boolean;
  usage: Record<string, number>;
  liveIds: Set<string>;
  onEdit: (f: CatalogField) => void;
  onChange: (fn: (d: CatalogDocument) => CatalogDocument) => void;
}) {
  const [bucket, setBucket] = useState<FieldsBucket>("overview");
  const [showArchived, setShowArchived] = useState(false);
  const [portfolioRole, setPortfolioRole] = useState(() =>
    doc.sports.find((s) => s.slug === "football" && s.status === "active")
      ? "sport:football"
      : doc.sports.find((s) => s.status === "active")
        ? `sport:${doc.sports.find((s) => s.status === "active")!.slug}`
        : doc.professions.find((p) => p.status === "active")
          ? `profession:${doc.professions.find((p) => p.status === "active")!.slug}`
          : "sport:football",
  );
  const buckets: { id: FieldsBucket; label: string; hint: string }[] = [
    { id: "overview", label: "Overview", hint: "Same for every role" },
    { id: "career", label: "Career", hint: "Same for every role" },
    { id: "achievements", label: "Achievements", hint: "Same for every role" },
    { id: "media", label: "Media", hint: "Photos & highlights · mobile Media tab" },
    { id: "portfolio", label: "Portfolio", hint: "Role-unique fields · one Me tab" },
  ];

  const counts = useMemo(() => {
    const out: Record<FieldsBucket, number> = {
      overview: 0,
      career: 0,
      achievements: 0,
      media: 0,
      portfolio: 0,
    };
    for (const f of doc.fields) {
      if (f.status !== "active") continue;
      out[fieldBucket(f)] += 1;
    }
    return out;
  }, [doc.fields]);

  const athleteRoles = useMemo(
    () =>
      [...doc.sports]
        .sort(bySort)
        .map((s) => ({
          value: `sport:${s.slug}`,
          label: `${s.label}${s.status === "archived" ? " (archived)" : ""}`,
          active: s.status === "active",
        })),
    [doc.sports],
  );
  const professionalRoles = useMemo(
    () =>
      [...doc.professions]
        .sort(bySort)
        .map((p) => ({
          value: `profession:${p.slug}`,
          label: `${p.label}${p.status === "archived" ? " (archived)" : ""}`,
          active: p.status === "active",
        })),
    [doc.professions],
  );
  const roleScopes = [...athleteRoles, ...professionalRoles];

  const portfolioGroup: "athlete" | "professional" = portfolioRole.startsWith("profession:")
    ? "professional"
    : "athlete";
  const rolesInGroup = portfolioGroup === "athlete" ? athleteRoles : professionalRoles;

  // Keep selection valid when sports/professions change.
  useEffect(() => {
    if (roleScopes.length === 0) return;
    if (roleScopes.some((s) => s.value === portfolioRole)) return;
    const preferred =
      (portfolioGroup === "athlete" ? athleteRoles : professionalRoles).find((r) => r.active) ??
      athleteRoles.find((r) => r.active) ??
      professionalRoles.find((r) => r.active) ??
      roleScopes[0];
    if (preferred) setPortfolioRole(preferred.value);
  }, [athleteRoles, professionalRoles, portfolioGroup, portfolioRole, roleScopes]);

  const rows = useMemo(() => {
    let list = doc.fields.filter((f) => fieldBucket(f) === bucket);
    if (!showArchived) list = list.filter((f) => f.status === "active");
    if (bucket === "portfolio") {
      list = list.filter((f) => scopeKey(f) === portfolioRole);
    } else if (bucket === "media") {
      // Account + sport/profession-scoped highlight fields for the Media tab.
    } else {
      list = list.filter((f) => COMMON_FIELD_SCOPES.has(f.scope_kind));
      // Overview shows every copy (including cross-scope duplicates) so they can be deleted.
    }
    return [...list].sort(bySort);
  }, [doc.fields, bucket, portfolioRole, showArchived]);

  const bucketLabel =
    bucket === "overview"
      ? "Overview"
      : bucket === "career"
        ? "Career"
        : bucket === "achievements"
          ? "Achievements"
          : bucket === "media"
            ? "Media"
            : "Portfolio";

  const duplicateKeys = useMemo(() => {
    if (!SHARED_ENTITY_BUCKETS.has(bucket)) return new Set<string>();
    const counts = new Map<string, number>();
    for (const f of rows) {
      if (f.status !== "active") continue;
      counts.set(f.key, (counts.get(f.key) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [bucket, rows]);

  const sectionLabel = (key: string | null) => doc.sections.find((s) => s.key === key)?.label ?? "—";
  const [roleKind, roleRef] = portfolioRole.split(":");

  const removeFields = (targets: CatalogField[]) => {
    if (!targets.length) return;
    const liveOnes = targets.filter((f) => liveIds.has(f.id));
    const draftOnes = targets.filter((f) => !liveIds.has(f.id));
    const labels = targets.map((f) => f.label || f.key).join(", ");
    const msg =
      liveOnes.length === 0
        ? `Delete ${targets.length === 1 ? `"${labels}"` : `${targets.length} fields`} from this draft?`
        : draftOnes.length === 0
          ? `Remove ${targets.length === 1 ? `"${labels}"` : `${targets.length} fields`} from ${bucketLabel}? Existing answers stay; the field is archived and hidden from forms.`
          : `Remove ${targets.length} field(s)? Draft-only copies are deleted; published ones are archived (answers kept).`;
    if (!window.confirm(msg)) return;
    const archiveIds = new Set(liveOnes.map((f) => f.id));
    const deleteIds = new Set(draftOnes.map((f) => f.id));
    onChange((d) => ({
      ...d,
      fields: d.fields
        .filter((x) => !deleteIds.has(x.id))
        .map((x) => (archiveIds.has(x.id) ? { ...x, status: "archived" as const } : x)),
    }));
  };

  const cleanBucketDuplicates = () => {
    const active = doc.fields.filter(
      (f) =>
        fieldBucket(f) === bucket &&
        f.status === "active" &&
        (bucket === "media" || COMMON_FIELD_SCOPES.has(f.scope_kind)),
    );
    const keep = new Set(
      (bucket === "overview" ? dedupeFields(active) : dedupeSharedBucket(active)).map((f) => f.id),
    );
    const drop = active.filter((f) => !keep.has(f.id));
    if (drop.length === 0) {
      window.alert(`No ${bucketLabel} duplicates to clean.`);
      return;
    }
    removeFields(drop);
  };

  const setPortfolioGroup = (group: "athlete" | "professional") => {
    const list = group === "athlete" ? athleteRoles : professionalRoles;
    const next = list.find((r) => r.active) ?? list[0];
    if (next) setPortfolioRole(next.value);
  };

  const defaultNewField = (): CatalogField => {
    if (bucket === "portfolio") {
      // Role-unique attribute — any input type (text, date, select, …).
      // Section defaults to Clips; change it in the editor if needed.
      return {
        id: newId(),
        key: "",
        scope_kind: roleKind as CatalogField["scope_kind"],
        scope_ref: roleRef ?? null,
        target: "profile",
        section: "portfolio",
        label: "",
        help_text: "",
        placeholder: "",
        input_type: "text",
        is_required: false,
        validation: {},
        sort_order: (rows.at(-1)?.sort_order ?? 0) + 10,
        visibility: "public",
        editable_by: "owner",
        storage_column: null,
        legacy_column: null,
        is_system: false,
        status: "active",
        replaced_by_id: null,
        options: [],
      };
    }
    const target =
      bucket === "career"
        ? "career"
        : bucket === "achievements"
          ? "achievement"
          : bucket === "media"
            ? "media"
            : ("profile" as const);
    return {
      id: newId(),
      key: "",
      scope_kind: "account",
      scope_ref: null,
      target,
      section: bucket === "media" ? "media" : bucket,
      label: "",
      help_text: "",
      placeholder: "",
      input_type: "text",
      is_required: false,
      validation: {},
      sort_order: (rows.at(-1)?.sort_order ?? 0) + 10,
      visibility: "public",
      editable_by: "owner",
      storage_column: null,
      legacy_column: null,
      is_system: false,
      status: "active",
      replaced_by_id: null,
      options: [],
    };
  };

  const activeRows = rows.filter((r) => r.status === "active");

  const moveField = (f: CatalogField, dir: -1 | 1) => {
    onChange((d) => ({ ...d, fields: reorder(d.fields, activeRows, f.id, dir) }));
  };

  const toggleArchive = (f: CatalogField) => {
    onChange((d) => ({
      ...d,
      fields: d.fields.map((x) =>
        x.id === f.id ? { ...x, status: x.status === "active" ? "archived" : "active" } : x,
      ),
    }));
  };

  const deleteField = (f: CatalogField) => {
    const ids = sharedBucketCloneIds(doc.fields, f);
    const all = doc.fields.filter((x) => ids.includes(x.id) && x.status === "active");
    if (
      all.length > 1 &&
      window.confirm(
        `"${f.label || f.key}" also has ${all.length - 1} duplicate copy(ies) under other scopes. Include those too?`,
      )
    ) {
      removeFields(all);
      return;
    }
    removeFields([f]);
  };

  const fieldMeta = (f: CatalogField) => (
    <>
      {f.key}
      {f.is_system ? " · built-in" : ""}
      {f.storage_column ? ` · ${f.storage_column}` : ""}
      {!liveIds.has(f.id) ? " · draft only" : ""}
    </>
  );

  const fieldRules = (f: CatalogField) => (
    <>
      {f.is_required ? "Required · " : ""}
      {f.visibility}
      {f.options.length ? ` · ${f.options.filter((o) => o.status === "active").length} options` : ""}
    </>
  );

  const fieldActions = (f: CatalogField) => {
    const clones = sharedBucketCloneIds(doc.fields, f).filter((id) => id !== f.id);
    return (
      <div className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap">
        <button type="button" className={buttonClass} disabled={!editable} onClick={() => onEdit(f)}>
          Edit
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!editable}
          title={f.status === "active" ? "Archive (answers are kept)" : "Restore"}
          onClick={() => toggleArchive(f)}
        >
          {f.status === "active" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!editable || f.status !== "active"}
          title={
            clones.length > 0
              ? "Delete this field (prompts to include duplicates)"
              : liveIds.has(f.id)
                ? `Remove from ${bucketLabel} (archive)`
                : "Delete from draft"
          }
          onClick={() => deleteField(f)}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <ul className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 lg:block lg:divide-y lg:overflow-visible lg:p-0 lg:self-start">
        {buckets.map((b) => (
          <li key={b.id} className="shrink-0 lg:shrink">
            <button
              type="button"
              className={cn(
                "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition-colors lg:px-4 lg:py-3",
                bucket === b.id ? "rounded-lg bg-muted/60 lg:rounded-none" : "hover:bg-muted/30",
              )}
              onClick={() => setBucket(b.id)}
            >
              <span className="flex w-full items-center justify-between gap-2 font-medium whitespace-nowrap">
                {b.label}
                <span className="text-xs font-normal text-text-hint">{counts[b.id]}</span>
              </span>
              <span className="hidden text-xs text-text-hint lg:inline">{b.hint}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          {bucket === "portfolio" ? (
            <>
              <Field label="Account role">
                <select
                  className={inputClass}
                  value={portfolioGroup}
                  onChange={(e) => setPortfolioGroup(e.target.value as "athlete" | "professional")}
                >
                  <option value="athlete">Athlete</option>
                  <option value="professional">Professional</option>
                </select>
              </Field>
              <Field
                label={portfolioGroup === "athlete" ? "Sport" : "Profession"}
                hint={
                  rolesInGroup.length === 0
                    ? `Add ${portfolioGroup === "athlete" ? "sports" : "professions"} under Roles first.`
                    : portfolioGroup === "athlete"
                      ? "All sports added for athletes."
                      : "All professional roles you added."
                }
              >
                <select
                  className={inputClass}
                  value={portfolioRole}
                  disabled={rolesInGroup.length === 0}
                  onChange={(e) => setPortfolioRole(e.target.value)}
                >
                  {rolesInGroup.length === 0 ? (
                    <option value="">No roles yet</option>
                  ) : (
                    rolesInGroup.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))
                  )}
                </select>
              </Field>
            </>
          ) : null}
          <button
            type="button"
            className={primaryButtonClass}
            disabled={!editable || (bucket === "portfolio" && roleScopes.length === 0)}
            onClick={() => onEdit(defaultNewField())}
          >
            <Plus className="h-4 w-4" />{" "}
            {bucket === "career"
              ? "Add career field"
              : bucket === "achievements"
                ? "Add achievement field"
                : bucket === "media"
                  ? "Add media field"
                  : "Add field"}
          </button>
          <label className="flex items-center gap-2 text-xs text-text-secondary sm:ml-auto">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          {SHARED_ENTITY_BUCKETS.has(bucket) && duplicateKeys.size > 0 ? (
            <button
              type="button"
              className={buttonClass}
              disabled={!editable}
              title="Keep one copy of each duplicate key; archive or delete the rest"
              onClick={() => cleanBucketDuplicates()}
            >
              Clean {duplicateKeys.size} duplicate key{duplicateKeys.size === 1 ? "" : "s"}
            </button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <AdminEmpty
            title="No entities here yet"
            description={
              bucket === "portfolio"
                ? "Choose Athlete or Professional, pick a specific sport/role, then add fields for that role."
                : bucket === "career"
                  ? "Add fields shown on every career entry (text, date, select, url, …). Same for all roles."
                  : "Add a field for this section. These entities are shared across roles."
            }
          />
        ) : (
          <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead className="bg-muted/40 text-left text-xs text-text-secondary">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Order</th>
                  <th className="whitespace-nowrap px-3 py-2">Field</th>
                  <th className="whitespace-nowrap px-3 py-2">Type</th>
                  {bucket === "portfolio" ? (
                    <th className="whitespace-nowrap px-3 py-2">Section</th>
                  ) : (
                    <th className="whitespace-nowrap px-3 py-2">Applies to</th>
                  )}
                  <th className="whitespace-nowrap px-3 py-2">Rules</th>
                  <th className="whitespace-nowrap px-3 py-2">Usage</th>
                  <th className="whitespace-nowrap px-3 py-2">Status</th>
                  <th className="whitespace-nowrap px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((f) => {
                  const isDuplicate = duplicateKeys.has(f.key);
                  return (
                    <tr key={f.id} className={f.status === "archived" ? "opacity-60" : undefined}>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className={buttonClass}
                            aria-label="Move up"
                            disabled={!editable || f.status !== "active"}
                            onClick={() => moveField(f, -1)}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className={buttonClass}
                            aria-label="Move down"
                            disabled={!editable || f.status !== "active"}
                            onClick={() => moveField(f, 1)}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="min-w-[12rem] px-3 py-2">
                        <p className="font-medium">
                          {f.label || "(no label)"}
                          {isDuplicate ? (
                            <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                              duplicate
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-text-hint">{fieldMeta(f)}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {INPUT_TYPE_LABELS[f.input_type] ?? f.input_type}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-text-secondary">
                        {bucket === "portfolio" ? sectionLabel(f.section) : scopeLabel(doc, f)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-text-secondary">
                        {fieldRules(f)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">{usage[f.id] ?? 0}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <StatusPill status={f.status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle">
                        <div className="flex justify-end">{fieldActions(f)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  doc,
  isNew,
  usage,
  inputTypes,
  onClose,
  onSave,
}: {
  field: CatalogField;
  doc: CatalogDocument;
  isNew: boolean;
  usage: number;
  inputTypes: Record<string, number>;
  onClose: () => void;
  onSave: (f: CatalogField) => void;
}) {
  const [f, setF] = useState<CatalogField>(field);
  const [newOption, setNewOption] = useState("");
  const typeLocked = !isNew && usage > 0;
  // Structured storage columns can't change type; career/achievement entry fields can.
  const typeFrozen = typeLocked || Boolean(f.storage_column);
  const isSelect = f.input_type === "single_select" || f.input_type === "multi_select";
  const isNumber = f.input_type === "integer" || f.input_type === "decimal";
  const v = f.validation as Record<string, string | number | boolean | undefined>;
  const setRule = (key: string, value: string | number | boolean | undefined) =>
    setF({ ...f, validation: { ...f.validation, [key]: value === "" ? undefined : value } });
  const options = [...f.options].sort(bySort);
  const keyValid = /^[a-z][a-z0-9_]{1,62}$/.test(f.key);

  const targetForSection = (section: string, current: CatalogField["target"]): CatalogField["target"] => {
    if (section === "career") return "career";
    if (section === "achievements") return "achievement";
    if (section === "media") return "media";
    if (section === "portfolio" || LEGACY_PORTFOLIO_SECTION_KEYS.has(section)) {
      return current === "portfolio" || current === "clip" || current === "photo" || current === "link"
        ? "portfolio"
        : "profile";
    }
    return "profile";
  };

  const recordLabel =
    f.target === "career"
      ? "Career entry"
      : f.target === "achievement"
        ? "Achievement entry"
        : f.target === "media"
          ? "Media / highlight entry"
          : f.target === "clip"
            ? "Clip entry"
            : f.target === "photo"
              ? "Photo entry"
              : f.target === "link"
                ? "Link entry"
                : "Profile";

  return (
    <AdminModal
      open
      title={isNew ? "Add field" : `Edit “${field.label}”`}
      onClose={onClose}
      className="max-w-2xl"
      footer={
        <AdminModalFooter
          onCancel={onClose}
          onSave={() => {
            const validation = Object.fromEntries(
              Object.entries(f.validation).filter(([, x]) => x !== undefined),
            ) as Record<string, unknown>;
            const placeholder = (f.placeholder ?? "").trim();
            if (placeholder) validation.placeholder = placeholder;
            else delete validation.placeholder;
            onSave({
              ...f,
              placeholder,
              editable_by: "owner",
              target: targetForSection(f.section ?? "overview", f.target),
              validation,
            });
          }}
          disabled={!f.label.trim() || !keyValid || (isSelect && options.length === 0 && !v.allow_custom)}
          saveLabel="Apply to draft"
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label">
          <input
            className={inputClass}
            value={f.label}
            onChange={(e) => setF({ ...f, label: e.target.value, key: isNew && !field.key ? slugify(e.target.value) : f.key })}
          />
        </Field>
        <Field label="Key (permanent)" hint={isNew ? "Used by the API. Can't change after publishing." : "Keys never change; renaming the label is safe."}>
          <input className={inputClass} value={f.key} disabled={!isNew} onChange={(e) => setF({ ...f, key: slugify(e.target.value) })} />
        </Field>
        <Field label="Help text">
          <input className={inputClass} value={f.help_text} onChange={(e) => setF({ ...f, help_text: e.target.value })} />
        </Field>
        <Field label="Placeholder" hint="Shown inside empty inputs on mobile.">
          <input
            className={inputClass}
            value={f.placeholder ?? (typeof f.validation.placeholder === "string" ? f.validation.placeholder : "")}
            onChange={(e) => setF({ ...f, placeholder: e.target.value })}
          />
        </Field>
        <Field label="Section">
          <select
            className={inputClass}
            value={f.section ?? ""}
            onChange={(e) => {
              const section = e.target.value;
              setF({ ...f, section, target: targetForSection(section, f.target) });
            }}
          >
            {doc.sections
              .filter(
                (s) =>
                  !LEGACY_PORTFOLIO_SECTION_KEYS.has(s.key) &&
                  (s.status === "active" || s.key === (f.section ?? "")),
              )
              .map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                  {s.status === "archived" ? " (archived)" : ""}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Record">
          <input className={inputClass} value={recordLabel} disabled readOnly />
        </Field>
        {(f.scope_kind === "sport" || f.scope_kind === "profession") && (
          <Field label="Applies to" hint="Athlete sports or professional roles from Roles.">
            <select
              className={inputClass}
              value={`${f.scope_kind}:${f.scope_ref ?? ""}`}
              disabled={!isNew && usage > 0}
              onChange={(e) => {
                const [kind, ref] = e.target.value.split(":");
                setF({
                  ...f,
                  scope_kind: kind as CatalogField["scope_kind"],
                  scope_ref: ref || null,
                });
              }}
            >
              <optgroup label="Athlete · sports">
                {doc.sports.map((s) => (
                  <option key={s.id} value={`sport:${s.slug}`}>
                    {s.label}
                    {s.status === "archived" ? " (archived)" : ""}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Professional · roles">
                {doc.professions.map((p) => (
                  <option key={p.id} value={`profession:${p.slug}`}>
                    {p.label}
                    {p.status === "archived" ? " (archived)" : ""}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
        )}
        <Field
          label="Input type"
          hint={typeFrozen ? `${usage > 0 ? `${usage} saved answers — ` : ""}type is locked for this field.` : undefined}
        >
          <select
            className={inputClass}
            value={f.input_type}
            disabled={typeFrozen}
            onChange={(e) => setF({ ...f, input_type: e.target.value })}
          >
            {Object.keys(inputTypes).map((t) => (
              <option key={t} value={t}>
                {INPUT_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Visibility">
          <select className={inputClass} value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as CatalogField["visibility"] })}>
            <option value="public">Public</option>
            <option value="members">Signed-in members</option>
            <option value="private">Private (owner + reviewers)</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input
            type="checkbox"
            checked={f.is_required}
            onChange={(e) => setF({ ...f, is_required: e.target.checked })}
          />
          {f.target === "profile" ? "Required for profile completion" : "Required when saving an entry"}
        </label>
        {isNumber ? (
          <>
            <Field label="Minimum">
              <input className={inputClass} type="number" value={String(v.min ?? "")} onChange={(e) => setRule("min", e.target.value === "" ? "" : Number(e.target.value))} />
            </Field>
            <Field label="Maximum">
              <input className={inputClass} type="number" value={String(v.max ?? "")} onChange={(e) => setRule("max", e.target.value === "" ? "" : Number(e.target.value))} />
            </Field>
            <Field label="Unit (display)">
              <input className={inputClass} value={String(v.unit ?? "")} onChange={(e) => setRule("unit", e.target.value)} />
            </Field>
          </>
        ) : null}
        {f.input_type === "text" || f.input_type === "multiline" ? (
          <Field label="Max length">
            <input className={inputClass} type="number" value={String(v.max_length ?? "")} onChange={(e) => setRule("max_length", e.target.value === "" ? "" : Number(e.target.value))} />
          </Field>
        ) : null}
        {f.input_type === "multi_select" ? (
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" checked={Boolean(v.allow_custom)} onChange={(e) => setRule("allow_custom", e.target.checked || undefined)} />
            Allow custom entries
          </label>
        ) : null}
      </div>
      {isSelect ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-text-secondary">Options (values are permanent; archived options stay on existing answers)</p>
          {options.map((o) => (
            <div key={o.id} className={cn("flex items-center gap-2", o.status === "archived" && "opacity-60")}>
              <input
                className={inputClass}
                value={o.label}
                onChange={(e) => setF({ ...f, options: f.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })}
              />
              <span className="w-32 shrink-0 truncate text-xs text-text-hint">{o.value}</span>
              <button type="button" className={buttonClass} aria-label="Move up" onClick={() => setF({ ...f, options: reorder(f.options, options, o.id, -1) })}>
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" className={buttonClass} aria-label="Move down" onClick={() => setF({ ...f, options: reorder(f.options, options, o.id, 1) })}>
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() =>
                  setF({ ...f, options: f.options.map((x) => (x.id === o.id ? { ...x, status: x.status === "active" ? "archived" : "active" } : x)) })
                }
              >
                {o.status === "active" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input className={inputClass} placeholder="New option label" value={newOption} onChange={(e) => setNewOption(e.target.value)} />
            <button
              type="button"
              className={buttonClass}
              disabled={!newOption.trim() || f.options.some((o) => o.value === optionValue(newOption))}
              onClick={() => {
                setF({
                  ...f,
                  options: [
                    ...f.options,
                    { id: newId(), value: optionValue(newOption), label: newOption.trim(), sort_order: (options.at(-1)?.sort_order ?? 0) + 10, status: "active" },
                  ],
                });
                setNewOption("");
              }}
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>
      ) : null}
    </AdminModal>
  );
}

function CategoryEditor({
  kind,
  row,
  isNew,
  onClose,
  onSave,
}: {
  kind: "sports" | "professions";
  row: CatalogSport | CatalogProfession;
  isNew: boolean;
  onClose: () => void;
  onSave: (row: CatalogSport | CatalogProfession) => void;
}) {
  const [r, setR] = useState(row);
  const pro = r as CatalogProfession;
  return (
    <AdminModal
      open
      title={isNew ? `Add ${kind === "sports" ? "sport" : "profession"}` : `Edit ${row.label}`}
      onClose={onClose}
      footer={
        <AdminModalFooter
          onCancel={onClose}
          onSave={() => onSave(r)}
          disabled={!r.label.trim() || !/^[a-z][a-z0-9_]{1,62}$/.test(r.slug)}
          saveLabel="Apply to draft"
        />
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <input className={inputClass} value={r.label} onChange={(e) => setR({ ...r, label: e.target.value, slug: isNew && !row.slug ? slugify(e.target.value) : r.slug })} />
        </Field>
        <Field label="Slug (permanent)">
          <input className={inputClass} value={r.slug} disabled={!isNew} onChange={(e) => setR({ ...r, slug: slugify(e.target.value) })} />
        </Field>
        <Field label="Profile title" hint={kind === "sports" ? "Shown on profiles, e.g. “Basketball Player”." : "Shown on profiles, e.g. “Photographer”."}>
          <input className={inputClass} value={r.profile_title} onChange={(e) => setR({ ...r, profile_title: e.target.value })} />
        </Field>
        <Field label="Description">
          <input className={inputClass} value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} />
        </Field>
        {kind === "professions" ? (
          <>
            <Field label="License wording" hint="Label for the license field, e.g. “Coaching license”.">
              <input className={inputClass} value={pro.license_label} onChange={(e) => setR({ ...pro, license_label: e.target.value })} />
            </Field>
            <Field label="Default marketplace category (slug)">
              <input className={inputClass} value={pro.default_service_category_slug} onChange={(e) => setR({ ...pro, default_service_category_slug: e.target.value })} />
            </Field>
          </>
        ) : null}
      </div>
    </AdminModal>
  );
}

const SECTION_KINDS: CatalogSection["kind"][] = [
  "attributes",
  "career",
  "achievements",
  "media",
  "portfolio",
];

function SectionsTab({
  doc,
  editable,
  onChange,
}: {
  doc: CatalogDocument;
  editable: boolean;
  onChange: (fn: (d: CatalogDocument) => CatalogDocument) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<CatalogSection["kind"]>("attributes");
  const rows = [...doc.sections]
    .filter(
      (s) =>
        // Hide legacy Clips/Photos/Links — Portfolio is the single Me tab.
        !LEGACY_PORTFOLIO_SECTION_KEYS.has(s.key) &&
        !(
          s.status === "archived" &&
          (s.key === "performance" || s.key === "qualifications")
        ),
    )
    .sort(bySort);

  const addSection = () => {
    const label = newLabel.trim();
    if (!label) return;
    let key = slugify(label);
    const used = new Set(doc.sections.map((s) => s.key));
    if (used.has(key)) {
      let i = 2;
      while (used.has(`${key}_${i}`)) i += 1;
      key = `${key}_${i}`;
    }
    const section: CatalogSection = {
      id: newId(),
      key,
      label,
      description: "",
      kind: newKind,
      roles: ["fan", "athlete", "professional"],
      sort_order: (rows.at(-1)?.sort_order ?? 0) + 10,
      status: "active",
    };
    onChange((d) => ({ ...d, sections: [...d.sections, section] }));
    setNewLabel("");
    setNewKind("attributes");
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">
          Role checkboxes control which account roles see each Me tab section (Overview, Career, Achievements, Media, Portfolio).
        </p>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={!editable}
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="h-4 w-4" /> Add section
        </button>
      </div>
      {adding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
          <Field label="Label">
            <input className={inputClass} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Overview" />
          </Field>
          <Field label="Kind">
            <select className={inputClass} value={newKind} onChange={(e) => setNewKind(e.target.value as CatalogSection["kind"])}>
              {SECTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className={primaryButtonClass} disabled={!newLabel.trim()} onClick={addSection}>
            Create
          </button>
          <button type="button" className={buttonClass} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : null}
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {rows.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
          <div className="flex gap-1">
            <button type="button" className={buttonClass} aria-label="Move up" disabled={!editable}
              onClick={() => onChange((d) => ({ ...d, sections: reorder(d.sections, rows, s.id, -1) }))}>
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={buttonClass} aria-label="Move down" disabled={!editable}
              onClick={() => onChange((d) => ({ ...d, sections: reorder(d.sections, rows, s.id, 1) }))}>
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            className={cn(inputClass, "max-w-xs")}
            value={s.label}
            disabled={!editable}
            onChange={(e) => onChange((d) => ({ ...d, sections: d.sections.map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x)) }))}
          />
          <span className="text-xs text-text-hint">
            {s.key} · {s.kind}
          </span>
          {(["fan", "athlete", "professional"] as const).map((role) => (
            <label key={role} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                disabled={!editable}
                checked={s.roles.includes(role)}
                onChange={(e) =>
                  onChange((d) => ({
                    ...d,
                    sections: d.sections.map((x) =>
                      x.id === s.id
                        ? { ...x, roles: e.target.checked ? [...x.roles, role] : x.roles.filter((y) => y !== role) }
                        : x,
                    ),
                  }))
                }
              />
              {role}
            </label>
          ))}
          <StatusPill status={s.status} />
          <button
            type="button"
            className={buttonClass}
            disabled={!editable}
            onClick={() =>
              onChange((d) => ({
                ...d,
                sections: d.sections.map((x) => (x.id === s.id ? { ...x, status: x.status === "active" ? "archived" : "active" } : x)),
              }))
            }
          >
            {s.status === "active" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
          </button>
        </li>
      ))}
    </ul>
    </div>
  );
}

function versionDisplayTitle(v: CatalogVersionRow) {
  const title = (v.title || v.notes || "").trim();
  if (title) return title;
  if (v.version != null) return `Catalog v${v.version}`;
  return `Draft from v${v.base_version ?? "—"}`;
}

function VersionDetailBody({
  detail,
  canWrite,
  onRename,
}: {
  detail: CatalogVersionDetail;
  canWrite: boolean;
  onRename: (row: CatalogVersionRow, title: string) => void;
}) {
  const [title, setTitle] = useState((detail.title || detail.notes || "").trim());
  useEffect(() => {
    setTitle((detail.title || detail.notes || "").trim());
  }, [detail.id, detail.title, detail.notes]);

  const changes = detail.diff?.changes ?? detail.impact?.changes ?? [];
  const changeCount = detail.diff?.change_count ?? detail.change_count ?? changes.length;

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="text-xs text-text-hint">What makes versions different</p>
        <p className="mt-1 text-text-secondary">
          Each published version is a full snapshot of sports, professions, sections, and fields. The list below
          shows only what changed compared to{" "}
          <span className="font-medium text-text-primary">
            {detail.compared_to?.label ?? "an empty catalog"}
          </span>
          .
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <StatusPill status={detail.status} />
          {detail.version != null ? <span className="rounded-full bg-muted px-2 py-0.5">v{detail.version}</span> : null}
          {detail.base_version != null && detail.status === "draft" ? (
            <span className="rounded-full bg-muted px-2 py-0.5">based on v{detail.base_version}</span>
          ) : null}
          <span className="rounded-full bg-muted px-2 py-0.5">{changeCount} change(s)</span>
        </div>
      </div>

      <Field label="Title">
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={title}
            maxLength={200}
            disabled={!canWrite}
            placeholder="Name this version"
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="button"
            className={buttonClass}
            disabled={!canWrite || title.trim() === (detail.title || detail.notes || "").trim()}
            onClick={() => onRename(detail, title.trim())}
          >
            Save
          </button>
        </div>
      </Field>

      <div>
        <p className="mb-2 text-xs font-medium text-text-secondary">
          Changes vs {detail.compared_to?.label ?? "previous"}
        </p>
        {changes.length === 0 ? (
          <p className="text-text-secondary">No differences from the previous snapshot.</p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {changes.map((c) => (
              <li key={`${c.kind}-${c.id}-${c.change}`} className="rounded-lg border border-border px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase text-text-hint">{c.kind}</span>
                  <span className="font-medium">{c.name}</span>
                  <StatusPill status={c.change} />
                  {c.newly_required ? <StatusPill status="newly required" /> : null}
                  <span className="ml-auto text-xs text-text-secondary">{c.usage} saved</span>
                </div>
                {c.fields_changed?.length ? (
                  <p className="mt-1 text-xs text-text-hint">Updated: {c.fields_changed.join(", ")}</p>
                ) : null}
                {c.note ? <p className="mt-1 text-xs text-text-secondary">{c.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HistoryTab({
  versions,
  activeDraftId,
  canWrite,
  busy,
  onOpenDetail,
  onEdit,
  onDelete,
  onRename,
}: {
  versions: CatalogVersionRow[];
  activeDraftId: string | null;
  canWrite: boolean;
  busy: boolean;
  onOpenDetail: (v: CatalogVersionRow) => void;
  onEdit: (v: CatalogVersionRow) => void;
  onDelete: (v: CatalogVersionRow) => void;
  onRename: (v: CatalogVersionRow, title: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-text-secondary">
        <p className="font-medium text-text-primary">Versions</p>
        <p className="mt-1">
          A version is a published snapshot of the whole profile catalog. Open <span className="font-medium">Details</span>{" "}
          to see what changed from the previous publish. Give each publish a title so history stays readable. Drafts are
          unpublished work-in-progress.
        </p>
      </div>
      <ul className="space-y-2">
        {versions.map((v) => {
          const active = activeDraftId === v.id;
          const canDelete = canWrite && (v.status === "draft" || v.status === "superseded");
          const changes = v.change_count ?? v.impact?.change_count ?? 0;
          return (
            <li
              key={v.id}
              className={cn(
                "rounded-xl border border-border bg-card px-4 py-3",
                active && "border-primary/40 bg-primary/5",
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  disabled={busy}
                  onClick={() => onOpenDetail(v)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-hint">
                      {v.version != null ? `v${v.version}` : "Draft"}
                    </span>
                    <StatusPill status={v.status} />
                    {active ? <span className="text-xs text-primary">editing now</span> : null}
                  </div>
                  <p className="mt-1 text-base font-semibold text-text-primary">{versionDisplayTitle(v)}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {changes > 0 ? `${changes} change(s) from previous` : "No stored change summary"}
                    {v.published_at
                      ? ` · published ${new Date(v.published_at).toLocaleString()}`
                      : v.updated_at
                        ? ` · updated ${new Date(v.updated_at).toLocaleString()}`
                        : ""}
                    {v.status === "draft" && v.base_version != null ? ` · based on v${v.base_version}` : ""}
                  </p>
                </button>
                <div className="flex flex-wrap items-center gap-1">
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => onOpenDetail(v)}>
                    Details
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy || !canWrite}
                    title={v.status === "draft" ? "Open draft" : "Fork into a new draft"}
                    onClick={() => onEdit(v)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy || !canWrite}
                    title="Rename"
                    onClick={() => {
                      const next = window.prompt("Version title", (v.title || v.notes || "").trim());
                      if (next == null) return;
                      onRename(v, next.trim());
                    }}
                  >
                    Title
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy || !canDelete}
                    title={
                      v.status === "published"
                        ? "Live published catalog can’t be deleted"
                        : v.status === "draft"
                          ? "Delete draft"
                          : "Remove from history"
                    }
                    onClick={() => onDelete(v)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
