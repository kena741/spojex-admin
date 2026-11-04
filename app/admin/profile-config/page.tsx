"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Archive, Info, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
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
  parseScope,
  SCOPE_LABELS,
  scopeReaches,
  scopeValue,
  SECTION_KINDS,
  slugify,
  tabReaches,
  targetForStorage,
  type CatalogCheck,
  type CatalogDocument,
  type CatalogField,
  type CatalogGroup,
  type CatalogOverview,
  type CatalogProfession,
  type CatalogSection,
  type CatalogSport,
  type CatalogStatus,
  type CatalogVersionDetail,
  type CatalogVersionRow,
} from "@/lib/profile-catalog";
import { cn } from "@/lib/utils";

type Tab = "categories" | "fields" | "sections" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "fields", label: "Fields" },
  { id: "sections", label: "Tabs" },
  { id: "categories", label: "Roles" },
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

/** Small ⓘ with the explanation in a native tooltip. */
function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text} className="inline-flex cursor-help align-middle text-text-hint">
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}

function Field({
  label,
  children,
  hint,
  tip,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  tip?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-1 text-xs font-medium text-text-secondary">
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </span>
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
  const [editingGroup, setEditingGroup] = useState<CatalogGroup | null>(null);
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
    return new Set(
      [...live.fields, ...live.sports, ...live.professions, ...live.sections, ...(live.groups ?? [])].map((r) => r.id),
    );
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
        `${otherDrafts.length} draft(s) already open. Create another?`,
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
          ? `New draft from the selected version.`
          : `Draft started from v${created.base_version}.`,
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
      setError("The live version can't be deleted.");
      return;
    }
    const label = row.version ? `v${row.version}` : `draft from v${row.base_version}`;
    if (
      !window.confirm(
        row.status === "draft"
          ? `Delete ${label}? Unpublished changes are lost.`
          : `Remove ${label} from history?`,
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
      // Optimistic lock: another tab or admin saved this draft.
      if (/reload it before saving|draft_conflict|someone else saved/i.test(message)) {
        try {
          const full = await catalogRequest<CatalogVersionRow>(`/drafts/${draft.id}`);
          setDraft(full);
          setDoc(full.document ?? null);
          setDirty(false);
          setError("Draft changed elsewhere and was reloaded. Re-apply your edits.");
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
      // The response carries the draft (document + updated_at) so the save lock stays in sync.
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
      setNotice(`Published v${out.version}.`);
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
            ? `v${overview.live.version}${draft ? ` · draft` : ""}`
            : undefined
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
              onEditGroup={setEditingGroup}
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
      {editingGroup && doc ? (
        <GroupEditor
          group={editingGroup}
          doc={doc}
          isNew={!liveIds.has(editingGroup.id)}
          onClose={() => setEditingGroup(null)}
          onSave={(next) => {
            update((d) => {
              const before = d.groups.find((g) => g.id === next.id);
              return {
                ...d,
                groups: before ? d.groups.map((g) => (g.id === next.id ? next : g)) : [...d.groups, next],
                // Fields follow their group to its tab.
                fields: d.fields.map((f) => (f.group === next.key ? { ...f, section: next.section } : f)),
              };
            });
            setEditingGroup(null);
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
          <label className="flex items-center gap-1 text-xs font-medium text-text-secondary">
            Version title <InfoTip text="Shown in Versions history." />
          </label>
          <input
            className={inputClass}
            value={publishTitle}
            maxLength={200}
            placeholder="e.g. Media tab fields + football highlights"
            onChange={(e) => setPublishTitle(e.target.value)}
          />
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
        {check.ok ? "Draft is valid." : `${check.errors.length} error(s) to fix.`}{" "}
        {check.impact.change_count} change(s)
        {check.impact.profiles_needing_update
          ? ` · ${check.impact.profiles_needing_update} profile(s) need an update`
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

function scopeLabel(doc: CatalogDocument, row: { scope_kind: string; scope_ref: string | null }) {
  if (row.scope_kind === "sport") {
    const sport = doc.sports.find((s) => s.slug === row.scope_ref);
    return `Athlete · ${sport?.label ?? row.scope_ref}`;
  }
  if (row.scope_kind === "profession") {
    const profession = doc.professions.find((p) => p.slug === row.scope_ref);
    return `Professional · ${profession?.label ?? row.scope_ref}`;
  }
  return SCOPE_LABELS[row.scope_kind] ?? row.scope_kind;
}

/** Every audience a field, group, or the preview filter can target. */
function audienceOptions(doc: CatalogDocument) {
  return [
    { label: "Roles", options: (["account", "fan", "athlete", "professional"] as const).map((v) => ({ value: v, label: SCOPE_LABELS[v] })) },
    {
      label: "Athlete · sports",
      options: [...doc.sports].sort(bySort).map((s) => ({
        value: `sport:${s.slug}`,
        label: `${s.label}${s.status === "archived" ? " (archived)" : ""}`,
      })),
    },
    {
      label: "Professional · professions",
      options: [...doc.professions].sort(bySort).map((p) => ({
        value: `profession:${p.slug}`,
        label: `${p.label}${p.status === "archived" ? " (archived)" : ""}`,
      })),
    },
  ];
}

function AudienceSelect({
  doc,
  value,
  onChange,
  disabled,
  includeAll,
}: {
  doc: CatalogDocument;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  includeAll?: boolean;
}) {
  return (
    <select className={inputClass} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {includeAll ? <option value="all">Everything</option> : null}
      {audienceOptions(doc).map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options
            .filter((o) => !(includeAll && o.value === "account"))
            .map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

function FieldsTab({
  doc,
  editable,
  usage,
  liveIds,
  onEdit,
  onEditGroup,
  onChange,
}: {
  doc: CatalogDocument;
  editable: boolean;
  usage: Record<string, number>;
  liveIds: Set<string>;
  onEdit: (f: CatalogField) => void;
  onEditGroup: (g: CatalogGroup) => void;
  onChange: (fn: (d: CatalogDocument) => CatalogDocument) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  // "all" | role | "sport:<slug>" | "profession:<slug>" — shows what that audience gets.
  const [audience, setAudience] = useState("all");
  const tabs = useMemo(
    () => [...doc.sections].filter((s) => showArchived || s.status === "active").sort(bySort),
    [doc.sections, showArchived],
  );
  const [tabKey, setTabKey] = useState<string>(() => tabs[0]?.key ?? "");
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];

  const visible = useCallback(
    (row: { status: CatalogStatus; scope_kind: string; scope_ref: string | null }) =>
      (showArchived || row.status === "active") && scopeReaches(row, audience),
    [showArchived, audience],
  );

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of doc.fields) {
      if (f.status !== "active" || !f.section || !scopeReaches(f, audience)) continue;
      out[f.section] = (out[f.section] ?? 0) + 1;
    }
    return out;
  }, [doc.fields, audience]);

  if (!tab) {
    return <AdminEmpty title="No tabs yet" description="Add a tab under Sections first." />;
  }

  const singleFields = doc.fields.filter((f) => f.section === tab.key && !f.group && visible(f)).sort(bySort);
  const groups = (doc.groups ?? []).filter((g) => g.section === tab.key && visible(g)).sort(bySort);
  const defaultScope = parseScope(audience === "all" ? "account" : audience);

  const newField = (group: CatalogGroup | null, siblings: CatalogField[]): CatalogField => ({
    id: newId(),
    key: "",
    ...(group ? { scope_kind: "account" as const, scope_ref: null } : defaultScope),
    target: targetForStorage(group?.storage),
    group: group?.key ?? null,
    section: tab.key,
    label: "",
    help_text: "",
    placeholder: "",
    input_type: "text",
    is_required: false,
    validation: {},
    sort_order: (siblings.at(-1)?.sort_order ?? 0) + 10,
    visibility: "public",
    editable_by: "owner",
    storage_column: null,
    legacy_column: null,
    is_system: false,
    status: "active",
    replaced_by_id: null,
    options: [],
  });

  const newGroup = (): CatalogGroup => ({
    id: newId(),
    key: "",
    section: tab.key,
    label: "",
    item_label: "",
    description: "",
    ...defaultScope,
    storage: "entry",
    max_items: null,
    sort_order: (groups.at(-1)?.sort_order ?? 0) + 10,
    status: "active",
  });

  const toggleGroup = (g: CatalogGroup) => {
    if (!liveIds.has(g.id)) {
      if (!window.confirm(`Delete group "${g.label || g.key}" and its fields from this draft?`)) return;
      onChange((d) => ({
        ...d,
        groups: d.groups.filter((x) => x.id !== g.id),
        fields: d.fields.filter((f) => f.group !== g.key),
      }));
      return;
    }
    onChange((d) => ({
      ...d,
      groups: d.groups.map((x) => (x.id === g.id ? { ...x, status: x.status === "active" ? "archived" : "active" } : x)),
    }));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <ul className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 lg:block lg:divide-y lg:overflow-visible lg:p-0 lg:self-start">
        {tabs.map((t) => (
          <li key={t.id} className="shrink-0 lg:shrink">
            <button
              type="button"
              className={cn(
                "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition-colors lg:px-4 lg:py-3",
                tab.key === t.key ? "rounded-lg bg-muted/60 lg:rounded-none" : "hover:bg-muted/30",
                (t.status === "archived" || !tabReaches(t, audience)) && "opacity-60",
              )}
              onClick={() => setTabKey(t.key)}
            >
              <span className="flex w-full items-center justify-between gap-2 font-medium whitespace-nowrap">
                {t.label}
                <span className="text-xs font-normal text-text-hint">{counts[t.key] ?? 0}</span>
              </span>
              <span className="hidden text-xs text-text-hint lg:inline">{tabAudienceLabel(doc, t)}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Preview as" tip="Show only what this role, sport, or profession sees.">
            <AudienceSelect doc={doc} value={audience} onChange={setAudience} includeAll />
          </Field>
          <button type="button" className={primaryButtonClass} disabled={!editable} onClick={() => onEdit(newField(null, singleFields))}>
            <Plus className="h-4 w-4" /> Add field
          </button>
          <button type="button" className={buttonClass} disabled={!editable} onClick={() => onEditGroup(newGroup())}>
            <Plus className="h-4 w-4" /> Add repeatable group
          </button>
          <label className="flex items-center gap-2 text-xs text-text-secondary sm:ml-auto">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>
        {audience !== "all" && !tabReaches(tab, audience) ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-text-secondary">
            Hidden for this audience.
          </p>
        ) : null}

        <section className="space-y-2">
          <h3 className="flex items-center gap-1 text-sm font-semibold">
            Single-value fields <InfoTip text="One answer per profile. Required ones count toward completion." />
          </h3>
          <FieldTable
            doc={doc}
            rows={singleFields}
            editable={editable}
            usage={usage}
            liveIds={liveIds}
            onEdit={onEdit}
            onChange={onChange}
            empty="No fields."
          />
        </section>

        {groups.map((g) => {
          const groupFields = doc.fields.filter((f) => f.group === g.key && visible(f)).sort(bySort);
          return (
            <section key={g.id} className={cn("space-y-2 rounded-xl border border-border p-3", g.status === "archived" && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">
                    {g.label || "(no label)"} <span className="font-normal text-text-hint">· repeatable</span>{" "}
                    <InfoTip text="People can add many items, each with these fields." />
                  </h3>
                  <p className="text-xs text-text-hint">
                    {g.key} · {scopeLabel(doc, g)} · each item: {g.item_label || "item"}
                    {g.max_items ? ` · up to ${g.max_items}` : ""}
                    {g.storage !== "entry" ? ` · built-in ${g.storage} records` : ""}
                  </p>
                </div>
                <StatusPill status={g.status} />
                <button type="button" className={buttonClass} disabled={!editable} onClick={() => onEditGroup(g)}>
                  Edit group
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!editable || g.storage !== "entry"}
                  title={g.storage !== "entry" ? "Built-in group" : g.status === "active" ? "Archive (records are kept)" : "Restore"}
                  onClick={() => toggleGroup(g)}
                >
                  {g.status === "active" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={!editable || g.status !== "active"}
                  onClick={() => onEdit(newField(g, groupFields))}
                >
                  <Plus className="h-4 w-4" /> Add field
                </button>
              </div>
              <FieldTable
                doc={doc}
                rows={groupFields}
                editable={editable}
                usage={usage}
                liveIds={liveIds}
                onEdit={onEdit}
                onChange={onChange}
                empty="No fields."
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function tabAudienceLabel(doc: CatalogDocument, s: CatalogSection) {
  const roles = s.roles.length === 3 ? "Everyone" : s.roles.join(", ") || "Nobody";
  if (!s.categories?.length) return roles;
  const names = s.categories.map((c) => {
    const [kind, slug] = c.split(":");
    const rows = kind === "sport" ? doc.sports : doc.professions;
    return rows.find((r) => r.slug === slug)?.label ?? slug;
  });
  return `${roles} · ${names.join(", ")}`;
}

function FieldTable({
  doc,
  rows,
  editable,
  usage,
  liveIds,
  onEdit,
  onChange,
  empty,
}: {
  doc: CatalogDocument;
  rows: CatalogField[];
  editable: boolean;
  usage: Record<string, number>;
  liveIds: Set<string>;
  onEdit: (f: CatalogField) => void;
  onChange: (fn: (d: CatalogDocument) => CatalogDocument) => void;
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-xs text-text-hint">{empty}</p>;
  const activeRows = rows.filter((r) => r.status === "active");
  const setStatus = (f: CatalogField) => {
    if (!liveIds.has(f.id)) {
      if (!window.confirm(`Delete "${f.label || f.key}" from this draft?`)) return;
      onChange((d) => ({ ...d, fields: d.fields.filter((x) => x.id !== f.id) }));
      return;
    }
    onChange((d) => ({
      ...d,
      fields: d.fields.map((x) => (x.id === f.id ? { ...x, status: x.status === "active" ? "archived" : "active" } : x)),
    }));
  };
  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card [-webkit-overflow-scrolling:touch]">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead className="bg-muted/40 text-left text-xs text-text-secondary">
          <tr>
            <th className="whitespace-nowrap px-3 py-2">Order</th>
            <th className="whitespace-nowrap px-3 py-2">Field</th>
            <th className="whitespace-nowrap px-3 py-2">Type</th>
            <th className="whitespace-nowrap px-3 py-2">Applies to</th>
            <th className="whitespace-nowrap px-3 py-2">Rules</th>
            <th className="whitespace-nowrap px-3 py-2">Usage</th>
            <th className="whitespace-nowrap px-3 py-2">Status</th>
            <th className="whitespace-nowrap px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((f) => (
            <tr key={f.id} className={f.status === "archived" ? "opacity-60" : undefined}>
              <td className="whitespace-nowrap px-3 py-2">
                <div className="flex gap-1">
                  {([-1, 1] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      className={buttonClass}
                      aria-label={dir < 0 ? "Move up" : "Move down"}
                      disabled={!editable || f.status !== "active"}
                      onClick={() => onChange((d) => ({ ...d, fields: reorder(d.fields, activeRows, f.id, dir) }))}
                    >
                      {dir < 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </td>
              <td className="min-w-[12rem] px-3 py-2">
                <p className="font-medium">{f.label || "(no label)"}</p>
                <p className="text-xs text-text-hint">
                  {f.key}
                  {f.is_system ? " · built-in" : ""}
                  {f.storage_column ? ` · ${f.storage_column}` : ""}
                  {!liveIds.has(f.id) ? " · draft only" : ""}
                </p>
              </td>
              <td className="whitespace-nowrap px-3 py-2">{INPUT_TYPE_LABELS[f.input_type] ?? f.input_type}</td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-text-secondary">{scopeLabel(doc, f)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-text-secondary">
                {f.is_required ? "Required · " : ""}
                {f.visibility}
                {f.options.length ? ` · ${f.options.filter((o) => o.status === "active").length} options` : ""}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs">{usage[f.id] ?? 0}</td>
              <td className="whitespace-nowrap px-3 py-2">
                <StatusPill status={f.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-2 align-middle">
                <div className="flex justify-end gap-1">
                  <button type="button" className={buttonClass} disabled={!editable} onClick={() => onEdit(f)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!editable}
                    title={!liveIds.has(f.id) ? "Delete from draft" : f.status === "active" ? "Archive (answers are kept)" : "Restore"}
                    onClick={() => setStatus(f)}
                  >
                    {!liveIds.has(f.id) ? (
                      <Trash2 className="h-4 w-4" />
                    ) : f.status === "active" ? (
                      <Archive className="h-4 w-4" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupEditor({
  group,
  doc,
  isNew,
  onClose,
  onSave,
}: {
  group: CatalogGroup;
  doc: CatalogDocument;
  isNew: boolean;
  onClose: () => void;
  onSave: (g: CatalogGroup) => void;
}) {
  const [g, setG] = useState<CatalogGroup>(group);
  const keyValid = /^[a-z][a-z0-9_]{1,62}$/.test(g.key);
  const keyTaken = isNew && doc.groups.some((x) => x.key === g.key);
  return (
    <AdminModal
      open
      title={isNew ? "Add repeatable group" : `Edit “${group.label}”`}
      onClose={onClose}
      className="max-w-2xl"
      footer={
        <AdminModalFooter
          onCancel={onClose}
          onSave={() => onSave({ ...g, label: g.label.trim(), item_label: g.item_label.trim() })}
          disabled={!g.label.trim() || !keyValid || keyTaken}
          saveLabel="Apply to draft"
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label">
          <input
            className={inputClass}
            value={g.label}
            onChange={(e) => setG({ ...g, label: e.target.value, key: isNew && !group.key ? slugify(e.target.value) : g.key })}
          />
        </Field>
        <Field label="Key" tip="Permanent ID used by the API." hint={keyTaken ? "Already used." : undefined}>
          <input className={inputClass} value={g.key} disabled={!isNew} onChange={(e) => setG({ ...g, key: slugify(e.target.value) })} />
        </Field>
        <Field label="Item name">
          <input className={inputClass} placeholder="e.g. Reel" value={g.item_label} onChange={(e) => setG({ ...g, item_label: e.target.value })} />
        </Field>
        <Field label="Tab">
          <select
            className={inputClass}
            value={g.section}
            onChange={(e) => setG({ ...g, section: e.target.value })}
          >
            {doc.sections
              .filter((s) => s.status === "active" || s.key === g.section)
              .sort(bySort)
              .map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Applies to" tip={isNew ? undefined : "Locked after publishing."}>
          <AudienceSelect
            doc={doc}
            value={scopeValue(g)}
            disabled={!isNew}
            onChange={(value) => setG({ ...g, ...parseScope(value) })}
          />
        </Field>
        <Field label="Max items">
          <input
            className={inputClass}
            type="number"
            min={1}
            placeholder="No limit"
            value={g.max_items ?? ""}
            onChange={(e) => setG({ ...g, max_items: e.target.value === "" ? null : Math.max(1, Number(e.target.value)) })}
          />
        </Field>
      </div>
    </AdminModal>
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
  const group = f.group ? doc.groups.find((g) => g.key === f.group) ?? null : null;
  const typeLocked = !isNew && usage > 0;
  // Structured storage columns can't change type.
  const typeFrozen = typeLocked || Boolean(f.storage_column);
  const isSelect = f.input_type === "single_select" || f.input_type === "multi_select";
  const isNumber = f.input_type === "integer" || f.input_type === "decimal";
  const v = f.validation as Record<string, string | number | boolean | undefined>;
  const setRule = (key: string, value: string | number | boolean | undefined) =>
    setF({ ...f, validation: { ...f.validation, [key]: value === "" ? undefined : value } });
  const options = [...f.options].sort(bySort);
  const keyValid = /^[a-z][a-z0-9_]{1,62}$/.test(f.key);

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
              // Group fields always sit on their group's tab.
              section: group ? group.section : f.section,
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
        <Field label="Key" tip="Permanent ID used by the API. Renaming the label is safe.">
          <input className={inputClass} value={f.key} disabled={!isNew} onChange={(e) => setF({ ...f, key: slugify(e.target.value) })} />
        </Field>
        <Field label="Help text">
          <input className={inputClass} value={f.help_text} onChange={(e) => setF({ ...f, help_text: e.target.value })} />
        </Field>
        <Field label="Placeholder" tip="Hint inside the empty input in the app.">
          <input
            className={inputClass}
            value={f.placeholder ?? (typeof f.validation.placeholder === "string" ? f.validation.placeholder : "")}
            onChange={(e) => setF({ ...f, placeholder: e.target.value })}
          />
        </Field>
        {group ? (
          <Field label="Group">
            <input className={inputClass} value={`${group.label} (repeatable)`} disabled readOnly />
          </Field>
        ) : (
          <Field label="Tab" tip="Where it shows. Separate from who it applies to.">
            <select className={inputClass} value={f.section ?? ""} onChange={(e) => setF({ ...f, section: e.target.value })}>
              {doc.sections
                .filter((s) => s.status === "active" || s.key === f.section)
                .sort(bySort)
                .map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                    {s.status === "archived" ? " (archived)" : ""}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="Applies to" tip={isNew ? undefined : "Locked after publishing. Archive and add a new field instead."}>
          <AudienceSelect
            doc={doc}
            value={scopeValue(f)}
            disabled={!isNew || Boolean(f.storage_column)}
            onChange={(value) => setF({ ...f, ...parseScope(value) })}
          />
        </Field>
        <Field
          label="Input type"
          hint={typeFrozen ? "Locked" : undefined}
          tip={typeFrozen && usage > 0 ? `${usage} saved answers` : undefined}
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
          {group ? `Required on every ${group.item_label || "item"}` : "Required for profile completion"}
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
          <p className="flex items-center gap-1 text-xs font-medium text-text-secondary">
            Options <InfoTip text="Values are permanent. Archived options stay on existing answers." />
          </p>
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
        <Field label="Profile title" tip={kind === "sports" ? "e.g. Basketball Player" : "e.g. Photographer"}>
          <input className={inputClass} value={r.profile_title} onChange={(e) => setR({ ...r, profile_title: e.target.value })} />
        </Field>
        <Field label="Description">
          <input className={inputClass} value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} />
        </Field>
        {kind === "professions" ? (
          <>
            <Field label="License label" tip="e.g. Coaching license">
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
  const [newKind, setNewKind] = useState<string>("attributes");
  const [showArchived, setShowArchived] = useState(false);
  const rows = [...doc.sections].filter((s) => showArchived || s.status === "active").sort(bySort);
  const setSection = (id: string, patch: (s: CatalogSection) => CatalogSection) =>
    onChange((d) => ({ ...d, sections: d.sections.map((x) => (x.id === id ? patch(x) : x)) }));

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
      categories: [],
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
        <p className="flex items-center gap-1 text-sm text-text-secondary">
          Who sees each tab
          <InfoTip text="Roles decide who sees a tab. Tick sports or professions to narrow it. Kind sets the icon." />
        </p>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={!editable}
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="h-4 w-4" /> Add tab
        </button>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>
      {adding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
          <Field label="Label">
            <input className={inputClass} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Overview" />
          </Field>
          <Field label="Kind">
            <select className={inputClass} value={newKind} onChange={(e) => setNewKind(e.target.value)}>
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
    <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card [-webkit-overflow-scrolling:touch]">
      <ul className="min-w-[1100px] divide-y divide-border">
        {rows.map((s) => (
          <li
            key={s.id}
            className="flex flex-nowrap items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm"
          >
            <div className="flex shrink-0 gap-1">
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
              className={cn(inputClass, "w-44 shrink-0")}
              value={s.label}
              disabled={!editable}
              onChange={(e) => onChange((d) => ({ ...d, sections: d.sections.map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x)) }))}
            />
            <span className="shrink-0 text-xs text-text-hint">
              {s.key} · {s.kind}
            </span>
            <select
              className={cn(inputClass, "h-8 w-32 shrink-0")}
              value={s.kind}
              disabled={!editable}
              aria-label="Icon kind"
              onChange={(e) => setSection(s.id, (x) => ({ ...x, kind: e.target.value }))}
            >
              {SECTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            {(["fan", "athlete", "professional"] as const).map((role) => (
              <label key={role} className="flex shrink-0 items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={s.roles.includes(role)}
                  onChange={(e) =>
                    setSection(s.id, (x) => {
                      const roles = e.target.checked ? [...x.roles, role] : x.roles.filter((y) => y !== role);
                      // Dropping a role drops its sport / profession narrowing too.
                      const prefix = role === "athlete" ? "sport:" : role === "professional" ? "profession:" : null;
                      const categories = e.target.checked || !prefix
                        ? x.categories ?? []
                        : (x.categories ?? []).filter((c) => !c.startsWith(prefix));
                      return { ...x, roles, categories };
                    })
                  }
                />
                {role}
              </label>
            ))}
            <div className="shrink-0">
              <CategoryPicker doc={doc} section={s} editable={editable} onChange={(categories) => setSection(s.id, (x) => ({ ...x, categories }))} />
            </div>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <StatusPill status={s.status} />
              <button
                type="button"
                className={buttonClass}
                disabled={!editable}
                title={s.status === "active" ? "Archive" : "Restore"}
                onClick={() =>
                  onChange((d) => ({
                    ...d,
                    sections: d.sections.map((x) => (x.id === s.id ? { ...x, status: x.status === "active" ? "archived" : "active" } : x)),
                  }))
                }
              >
                {s.status === "active" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

function CategoryPicker({
  doc,
  section,
  editable,
  onChange,
}: {
  doc: CatalogDocument;
  section: CatalogSection;
  editable: boolean;
  onChange: (categories: string[]) => void;
}) {
  const selected = section.categories ?? [];
  const choices = [
    ...(section.roles.includes("athlete")
      ? doc.sports.filter((x) => x.status === "active").map((x) => ({ value: `sport:${x.slug}`, label: x.label }))
      : []),
    ...(section.roles.includes("professional")
      ? doc.professions.filter((x) => x.status === "active").map((x) => ({ value: `profession:${x.slug}`, label: x.label }))
      : []),
  ];
  if (choices.length === 0) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-text-secondary">
        {selected.length ? `Only ${selected.length} sport/profession${selected.length === 1 ? "" : "s"}` : "All sports & professions"}
      </summary>
      <div className="mt-2 flex max-w-xl flex-wrap gap-x-3 gap-y-1">
        {choices.map((c) => (
          <label key={c.value} className="flex items-center gap-1">
            <input
              type="checkbox"
              disabled={!editable}
              checked={selected.includes(c.value)}
              onChange={(e) =>
                onChange(e.target.checked ? [...selected, c.value] : selected.filter((x) => x !== c.value))
              }
            />
            {c.label}
          </label>
        ))}
      </div>
    </details>
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
        <p className="text-text-secondary">
          Compared with{" "}
          <span className="font-medium text-text-primary">{detail.compared_to?.label ?? "an empty catalog"}</span>
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
        <p className="flex items-center gap-1 font-medium text-text-primary">
          Versions
          <InfoTip text="Each publish is a snapshot. Open Details to see what changed. Drafts are unpublished." />
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
