"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Archive, Plus, RotateCcw } from "lucide-react";
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
  type CatalogMetric,
  type CatalogOverview,
  type CatalogProfession,
  type CatalogSport,
  type CatalogVersionRow,
} from "@/lib/profile-catalog";
import { cn } from "@/lib/utils";

type Tab = "categories" | "fields" | "metrics" | "sections" | "verification" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "categories", label: "Sports & professions" },
  { id: "fields", label: "Entities" },
  { id: "metrics", label: "Sport metrics" },
  { id: "sections", label: "Sections" },
  { id: "verification", label: "Verification documents" },
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
  const [tab, setTab] = useState<Tab>("categories");
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
  const [editingField, setEditingField] = useState<CatalogField | null>(null);
  const [editingMetric, setEditingMetric] = useState<CatalogMetric | null>(null);
  const [editingCategory, setEditingCategory] = useState<
    { kind: "sports" | "professions"; row: CatalogSport | CatalogProfession } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await catalogRequest<CatalogOverview>("");
      setOverview(data);
      const open = data.versions.find((v) => v.status === "draft");
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
    return new Set([...live.fields, ...live.metrics, ...live.sports, ...live.professions].map((r) => r.id));
  }, [overview]);

  const update = (fn: (d: CatalogDocument) => CatalogDocument) => {
    if (!doc || !editable) return;
    setDoc(fn(doc));
    setDirty(true);
    setCheck(null);
  };

  const startDraft = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await catalogRequest<CatalogVersionRow>("/drafts", { method: "POST", body: "{}" });
      setDraft(created);
      setDoc(created.document ?? null);
      setDirty(false);
      setNotice(`Draft started from version ${created.base_version}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a draft");
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
      setDirty(false);
      setNotice("Draft saved.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
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
      const result = await catalogRequest<CatalogCheck>(`/drafts/${draft.id}/validate`, { method: "POST", body: "{}" });
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
    if (result) setPublishOpen(true);
  };

  const publish = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const out = await catalogRequest<{ version: number; recomputed_profiles: number }>(
        `/drafts/${draft.id}/publish`,
        { method: "POST", body: JSON.stringify({ confirm: true, expected_base_version: draft.base_version }) },
      );
      setPublishOpen(false);
      setCheck(null);
      setNotice(`Published version ${out.version}. ${out.recomputed_profiles} profiles had their completion updated.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
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
            : "Sports, professions, profile fields, metrics, and verification requirements"
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
              onEdit={setEditingField}
              onChange={update}
            />
          ) : null}
          {tab === "metrics" ? (
            <MetricsTab doc={doc} editable={editable} usage={usage} onEdit={setEditingMetric} onChange={update} />
          ) : null}
          {tab === "sections" ? <SectionsTab doc={doc} editable={editable} onChange={update} /> : null}
          {tab === "verification" ? (
            <VerificationTab doc={doc} editable={editable} documentTypes={overview.document_types} onChange={update} />
          ) : null}
          {tab === "history" ? <HistoryTab versions={overview.versions} /> : null}
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
      {editingMetric && doc ? (
        <MetricEditor
          metric={editingMetric}
          doc={doc}
          isNew={!liveIds.has(editingMetric.id)}
          usage={usage[editingMetric.id] ?? 0}
          onClose={() => setEditingMetric(null)}
          onSave={(next) => {
            update((d) => ({
              ...d,
              metrics: d.metrics.some((m) => m.id === next.id)
                ? d.metrics.map((m) => (m.id === next.id ? next : m))
                : [...d.metrics, next],
            }));
            setEditingMetric(null);
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
            disabled={!check?.ok}
            saveLabel={check?.ok ? "Publish" : "Fix errors first"}
          />
        }
      >
        {check ? <ImpactSummary check={check} /> : null}
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
      {block("sports", "Sports")}
      {block("professions", "Professions")}
    </div>
  );
}

function scopeKey(f: Pick<CatalogField, "scope_kind" | "scope_ref">) {
  return f.scope_ref ? `${f.scope_kind}:${f.scope_ref}` : f.scope_kind;
}

const PORTFOLIO_SECTION_KEYS = new Set(["clips", "photos", "links"]);
const COMMON_FIELD_SCOPES = new Set(["account", "fan", "athlete", "professional"]);

type FieldsBucket = "overview" | "career" | "achievements" | "portfolio";

function fieldBucket(f: CatalogField): FieldsBucket {
  if (f.section === "career" || f.target === "career") return "career";
  if (f.section === "achievements" || f.target === "achievement") return "achievements";
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

function scopeLabel(doc: CatalogDocument, f: CatalogField) {
  if (f.scope_kind === "sport") {
    const sport = doc.sports.find((s) => s.slug === f.scope_ref);
    return sport ? `Sport · ${sport.label}` : `Sport · ${f.scope_ref}`;
  }
  if (f.scope_kind === "profession") {
    const profession = doc.professions.find((p) => p.slug === f.scope_ref);
    return profession ? `Profession · ${profession.label}` : `Profession · ${f.scope_ref}`;
  }
  return SCOPE_LABELS[f.scope_kind] ?? f.scope_kind;
}

function FieldsTab({
  doc,
  editable,
  usage,
  onEdit,
  onChange,
}: {
  doc: CatalogDocument;
  editable: boolean;
  usage: Record<string, number>;
  onEdit: (f: CatalogField) => void;
  onChange: (fn: (d: CatalogDocument) => CatalogDocument) => void;
}) {
  const [bucket, setBucket] = useState<FieldsBucket>("overview");
  const [portfolioRole, setPortfolioRole] = useState(() =>
    doc.sports.find((s) => s.slug === "football" && s.status === "active")
      ? "sport:football"
      : doc.sports.find((s) => s.status === "active")
        ? `sport:${doc.sports.find((s) => s.status === "active")!.slug}`
        : doc.professions.find((p) => p.status === "active")
          ? `profession:${doc.professions.find((p) => p.status === "active")!.slug}`
          : "sport:football",
  );
  const [portfolioGroup, setPortfolioGroup] = useState<"all" | "clips" | "photos" | "links">("all");

  const buckets: { id: FieldsBucket; label: string; hint: string }[] = [
    { id: "overview", label: "Overview", hint: "Same for every role" },
    { id: "career", label: "Career", hint: "Same for every role" },
    { id: "achievements", label: "Achievements", hint: "Same for every role" },
    { id: "portfolio", label: "Portfolio", hint: "Clips, Photos, Links · role-unique" },
  ];

  const counts = useMemo(() => {
    const out: Record<FieldsBucket, number> = {
      overview: 0,
      career: 0,
      achievements: 0,
      portfolio: 0,
    };
    for (const f of doc.fields) out[fieldBucket(f)] += 1;
    return out;
  }, [doc.fields]);

  const roleScopes = [
    ...doc.sports.map((s) => ({
      value: `sport:${s.slug}`,
      label: `Sport · ${s.label}${s.status === "archived" ? " (archived)" : ""}`,
    })),
    ...doc.professions.map((p) => ({
      value: `profession:${p.slug}`,
      label: `Profession · ${p.label}${p.status === "archived" ? " (archived)" : ""}`,
    })),
  ];

  const rows = useMemo(() => {
    let list = doc.fields.filter((f) => fieldBucket(f) === bucket);
    if (bucket === "portfolio") {
      list = list.filter((f) => scopeKey(f) === portfolioRole);
      if (portfolioGroup !== "all") {
        list = list.filter(
          (f) =>
            f.section === portfolioGroup ||
            (portfolioGroup === "clips" && (f.target === "clip" || f.target === "portfolio")) ||
            (portfolioGroup === "photos" && f.target === "photo") ||
            (portfolioGroup === "links" && f.target === "link"),
        );
      }
    } else {
      list = list.filter((f) => COMMON_FIELD_SCOPES.has(f.scope_kind));
    }
    return [...list].sort(bySort);
  }, [doc.fields, bucket, portfolioRole, portfolioGroup]);

  const sectionLabel = (key: string | null) => doc.sections.find((s) => s.key === key)?.label ?? "—";
  const [roleKind, roleRef] = portfolioRole.split(":");

  const defaultNewField = (): CatalogField => {
    if (bucket === "portfolio") {
      const group = portfolioGroup === "all" ? "clips" : portfolioGroup;
      const target =
        group === "photos" ? "photo" : group === "links" ? "link" : ("profile" as CatalogField["target"]);
      return {
        id: newId(),
        key: "",
        scope_kind: roleKind as CatalogField["scope_kind"],
        scope_ref: roleRef ?? null,
        target: target === "profile" ? "profile" : target,
        section: group,
        label: "",
        help_text: "",
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
      bucket === "career" ? "career" : bucket === "achievements" ? "achievement" : ("profile" as const);
    return {
      id: newId(),
      key: "",
      scope_kind: "account",
      scope_ref: null,
      target,
      section: bucket,
      label: "",
      help_text: "",
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

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <ul className="divide-y divide-border rounded-xl border border-border bg-card self-start">
        {buckets.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              className={cn(
                "flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left text-sm transition-colors",
                bucket === b.id ? "bg-muted/60" : "hover:bg-muted/30",
              )}
              onClick={() => setBucket(b.id)}
            >
              <span className="flex w-full items-center justify-between gap-2 font-medium">
                {b.label}
                <span className="text-xs font-normal text-text-hint">{counts[b.id]}</span>
              </span>
              <span className="text-xs text-text-hint">{b.hint}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          {bucket === "portfolio" ? (
            <>
              <Field label="Role">
                <select
                  className={inputClass}
                  value={portfolioRole}
                  onChange={(e) => setPortfolioRole(e.target.value)}
                >
                  {roleScopes.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Group">
                <select
                  className={inputClass}
                  value={portfolioGroup}
                  onChange={(e) => setPortfolioGroup(e.target.value as typeof portfolioGroup)}
                >
                  <option value="all">All Portfolio</option>
                  <option value="clips">Clips</option>
                  <option value="photos">Photos</option>
                  <option value="links">Links</option>
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
            <Plus className="h-4 w-4" /> Add field
          </button>
        </div>

        {rows.length === 0 ? (
          <AdminEmpty
            title="No entities here yet"
            description={
              bucket === "portfolio"
                ? "Pick a sport or profession, then add fields for Clips, Photos, or Links."
                : "Add a field for this section. These entities are shared across roles."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-text-secondary">
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Type</th>
                  {bucket === "portfolio" ? <th className="px-3 py-2">Group</th> : <th className="px-3 py-2">Applies to</th>}
                  <th className="px-3 py-2">Rules</th>
                  <th className="px-3 py-2">Usage</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((f) => (
                  <tr key={f.id} className={f.status === "archived" ? "opacity-60" : undefined}>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className={buttonClass}
                          aria-label="Move up"
                          disabled={!editable}
                          onClick={() => onChange((d) => ({ ...d, fields: reorder(d.fields, rows, f.id, -1) }))}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          aria-label="Move down"
                          disabled={!editable}
                          onClick={() => onChange((d) => ({ ...d, fields: reorder(d.fields, rows, f.id, 1) }))}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{f.label || "(no label)"}</p>
                      <p className="text-xs text-text-hint">
                        {f.key}
                        {f.is_system ? " · built-in" : ""}
                        {f.storage_column ? ` · ${f.storage_column}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2">{INPUT_TYPE_LABELS[f.input_type] ?? f.input_type}</td>
                    <td className="px-3 py-2 text-xs text-text-secondary">
                      {bucket === "portfolio" ? sectionLabel(f.section) : scopeLabel(doc, f)}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-secondary">
                      {f.is_required ? "Required · " : ""}
                      {f.visibility}
                      {f.editable_by === "admin" ? " · admin-only" : ""}
                      {f.options.length ? ` · ${f.options.filter((o) => o.status === "active").length} options` : ""}
                    </td>
                    <td className="px-3 py-2 text-xs">{usage[f.id] ?? 0}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={f.status} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button type="button" className={buttonClass} disabled={!editable} onClick={() => onEdit(f)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={!editable}
                          title={f.status === "active" ? "Archive (answers are kept)" : "Restore"}
                          onClick={() =>
                            onChange((d) => ({
                              ...d,
                              fields: d.fields.map((x) =>
                                x.id === f.id ? { ...x, status: x.status === "active" ? "archived" : "active" } : x,
                              ),
                            }))
                          }
                        >
                          {f.status === "active" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
          onSave={() => onSave({ ...f, validation: Object.fromEntries(Object.entries(f.validation).filter(([, x]) => x !== undefined)) })}
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
        <Field label="Section">
          <select className={inputClass} value={f.section ?? ""} onChange={(e) => setF({ ...f, section: e.target.value })}>
            {doc.sections
              .filter((s) => !(s.status === "archived" && s.key === "portfolio"))
              .map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                  {s.status === "archived" ? " (archived)" : ""}
                </option>
              ))}
          </select>
        </Field>
        <Field
          label="Input type"
          hint={typeLocked ? `${usage} saved answers — archive this field and add a replacement to change its type.` : undefined}
        >
          <select
            className={inputClass}
            value={f.input_type}
            disabled={typeLocked || f.is_system}
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
        <Field label="Who can edit">
          <select className={inputClass} value={f.editable_by} onChange={(e) => setF({ ...f, editable_by: e.target.value as CatalogField["editable_by"] })}>
            <option value="owner">Profile owner</option>
            <option value="admin">Spojex admins only</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input
            type="checkbox"
            checked={f.is_required}
            disabled={f.target !== "profile"}
            onChange={(e) => setF({ ...f, is_required: e.target.checked })}
          />
          Required for profile completion
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
      {f.is_required && f.editable_by === "admin" ? (
        <p className="mt-2 text-xs text-red-600">A required field must be editable by the profile owner, or nobody can complete it.</p>
      ) : null}
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

function MetricsTab({
  doc,
  editable,
  usage,
  onEdit,
  onChange,
}: {
  doc: CatalogDocument;
  editable: boolean;
  usage: Record<string, number>;
  onEdit: (m: CatalogMetric) => void;
  onChange: (fn: (d: CatalogDocument) => CatalogDocument) => void;
}) {
  const [sport, setSport] = useState(doc.sports[0]?.slug ?? "");
  const rows = doc.metrics.filter((m) => m.sport === sport).sort(bySort);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Sport">
          <select className={inputClass} value={sport} onChange={(e) => setSport(e.target.value)}>
            {doc.sports.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={!editable || !sport}
          onClick={() =>
            onEdit({
              id: newId(), sport, key: "", label: "", value_type: "integer", unit: "", precision: 0, format: "",
              min_value: 0, max_value: null, lower_is_better: false, applies_when: {}, show_on_profile: true,
              show_on_career: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10, legacy_column: null, status: "active",
            })
          }
        >
          <Plus className="h-4 w-4" /> Add metric
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-text-secondary">
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Metric</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Shown on</th>
              <th className="px-3 py-2">Usage</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((m) => (
              <tr key={m.id} className={m.status === "archived" ? "opacity-60" : undefined}>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button type="button" className={buttonClass} aria-label="Move up" disabled={!editable}
                      onClick={() => onChange((d) => ({ ...d, metrics: reorder(d.metrics, rows, m.id, -1) }))}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className={buttonClass} aria-label="Move down" disabled={!editable}
                      onClick={() => onChange((d) => ({ ...d, metrics: reorder(d.metrics, rows, m.id, 1) }))}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium">{m.label}</p>
                  <p className="text-xs text-text-hint">
                    {m.key}
                    {m.applies_when?.field ? ` · when ${m.applies_when.field} ∈ ${(m.applies_when.in ?? []).join(", ")}` : ""}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs">
                  {m.value_type}
                  {m.unit ? ` (${m.unit})` : ""}
                  {m.value_type === "duration" ? ` · ${m.format}` : ""}
                </td>
                <td className="px-3 py-2 text-xs">
                  {[m.show_on_profile && "profile", m.show_on_career && "career"].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-xs">{usage[m.id] ?? 0}</td>
                <td className="px-3 py-2">
                  <StatusPill status={m.status} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <button type="button" className={buttonClass} disabled={!editable} onClick={() => onEdit(m)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!editable}
                      onClick={() =>
                        onChange((d) => ({
                          ...d,
                          metrics: d.metrics.map((x) =>
                            x.id === m.id ? { ...x, status: x.status === "active" ? "archived" : "active" } : x,
                          ),
                        }))
                      }
                    >
                      {m.status === "active" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricEditor({
  metric,
  doc,
  isNew,
  usage,
  onClose,
  onSave,
}: {
  metric: CatalogMetric;
  doc: CatalogDocument;
  isNew: boolean;
  usage: number;
  onClose: () => void;
  onSave: (m: CatalogMetric) => void;
}) {
  const [m, setM] = useState(metric);
  const locked = !isNew && usage > 0;
  const sportFields = doc.fields.filter(
    (f) => f.scope_kind === "sport" && f.scope_ref === m.sport && f.input_type.endsWith("select") && f.status === "active",
  );
  const condField = sportFields.find((f) => f.key === m.applies_when?.field);
  const num = (s: string) => (s === "" ? null : Number(s));
  return (
    <AdminModal
      open
      title={isNew ? "Add metric" : `Edit “${metric.label}”`}
      onClose={onClose}
      className="max-w-2xl"
      footer={
        <AdminModalFooter
          onCancel={onClose}
          onSave={() => onSave(m)}
          disabled={!m.label.trim() || !/^[a-z][a-z0-9_]{1,62}$/.test(m.key) || (m.value_type === "duration" && !m.format)}
          saveLabel="Apply to draft"
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label">
          <input className={inputClass} value={m.label} onChange={(e) => setM({ ...m, label: e.target.value, key: isNew && !metric.key ? slugify(e.target.value) : m.key })} />
        </Field>
        <Field label="Key (permanent, per sport)">
          <input className={inputClass} value={m.key} disabled={!isNew} onChange={(e) => setM({ ...m, key: slugify(e.target.value) })} />
        </Field>
        <Field label="Value type" hint={locked ? `${usage} saved values — add a replacement metric to change type or unit.` : undefined}>
          <select className={inputClass} value={m.value_type} disabled={locked} onChange={(e) => setM({ ...m, value_type: e.target.value as CatalogMetric["value_type"], format: e.target.value === "duration" ? m.format || "m:ss.SS" : "" })}>
            <option value="integer">Whole number</option>
            <option value="decimal">Decimal</option>
            <option value="duration">Duration (time)</option>
          </select>
        </Field>
        <Field label="Unit">
          <input className={inputClass} value={m.unit} disabled={locked} onChange={(e) => setM({ ...m, unit: e.target.value })} />
        </Field>
        {m.value_type === "duration" ? (
          <Field label="Time format">
            <select className={inputClass} value={m.format} onChange={(e) => setM({ ...m, format: e.target.value })}>
              <option value="ss.SS">ss.SS (sprints)</option>
              <option value="m:ss.SS">m:ss.SS (middle distance)</option>
              <option value="h:mm:ss">h:mm:ss (marathon)</option>
            </select>
          </Field>
        ) : null}
        {m.value_type !== "integer" ? (
          <Field label="Decimal places">
            <input className={inputClass} type="number" min={0} max={4} value={m.precision} onChange={(e) => setM({ ...m, precision: Number(e.target.value) })} />
          </Field>
        ) : null}
        <Field label="Minimum">
          <input className={inputClass} type="number" value={m.min_value ?? ""} onChange={(e) => setM({ ...m, min_value: num(e.target.value) })} />
        </Field>
        <Field label="Maximum">
          <input className={inputClass} type="number" value={m.max_value ?? ""} onChange={(e) => setM({ ...m, max_value: num(e.target.value) })} />
        </Field>
        <Field label="Only when field" hint="E.g. show a 100 m personal best only for 100 m sprinters.">
          <select
            className={inputClass}
            value={m.applies_when?.field ?? ""}
            onChange={(e) => setM({ ...m, applies_when: e.target.value ? { field: e.target.value, in: [] } : {} })}
          >
            <option value="">Always</option>
            {sportFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        {condField ? (
          <Field label="…has one of">
            <select
              multiple
              className="h-28 w-full rounded-lg border border-border bg-background px-2 text-sm"
              value={m.applies_when.in ?? []}
              onChange={(e) =>
                setM({ ...m, applies_when: { field: condField.key, in: Array.from(e.target.selectedOptions).map((o) => o.value) } })
              }
            >
              {condField.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={m.show_on_profile} onChange={(e) => setM({ ...m, show_on_profile: e.target.checked })} />
          Show on profile
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={m.show_on_career} onChange={(e) => setM({ ...m, show_on_career: e.target.checked })} />
          Track per career entry
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={m.lower_is_better} onChange={(e) => setM({ ...m, lower_is_better: e.target.checked })} />
          Lower is better (times)
        </label>
      </div>
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

function SectionsTab({
  doc,
  editable,
  onChange,
}: {
  doc: CatalogDocument;
  editable: boolean;
  onChange: (fn: (d: CatalogDocument) => CatalogDocument) => void;
}) {
  const rows = [...doc.sections]
    .filter(
      (s) =>
        !(
          s.status === "archived" &&
          (s.key === "performance" || s.key === "qualifications" || s.key === "portfolio")
        ),
    )
    .sort(bySort);
  return (
    <div className="space-y-3">
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

function VerificationTab({
  doc,
  editable,
  documentTypes,
  onChange,
}: {
  doc: CatalogDocument;
  editable: boolean;
  documentTypes: CatalogOverview["document_types"];
  onChange: (fn: (d: CatalogDocument) => CatalogDocument) => void;
}) {
  const roles = [
    { value: "athlete", label: "All athletes" },
    { value: "professional", label: "All professionals" },
    ...doc.professions.map((p) => ({ value: p.slug, label: `Profession · ${p.label}` })),
  ];
  const rows = [...doc.verification_requirements].sort(bySort);
  const setReq = (id: string, patch: Partial<(typeof rows)[number]>) =>
    onChange((d) => ({
      ...d,
      verification_requirements: d.verification_requirements.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <select className={inputClass} disabled={!editable} value={r.role_slug} onChange={(e) => setReq(r.id, { role_slug: e.target.value, sport: e.target.value === "athlete" ? r.sport : null })}>
            {roles.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
          <select className={inputClass} disabled={!editable || r.role_slug !== "athlete"} value={r.sport ?? ""} onChange={(e) => setReq(r.id, { sport: e.target.value || null })}>
            <option value="">Any sport</option>
            {doc.sports.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ))}
          </select>
          <select className={inputClass} disabled={!editable} value={r.document} onChange={(e) => setReq(r.id, { document: e.target.value })}>
            {documentTypes.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" disabled={!editable} checked={r.is_required} onChange={(e) => setReq(r.id, { is_required: e.target.checked })} />
            Required
          </label>
          <button
            type="button"
            className={buttonClass}
            disabled={!editable}
            onClick={() => onChange((d) => ({ ...d, verification_requirements: d.verification_requirements.filter((x) => x.id !== r.id) }))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className={buttonClass}
        disabled={!editable || documentTypes.length === 0}
        onClick={() =>
          onChange((d) => ({
            ...d,
            verification_requirements: [
              ...d.verification_requirements,
              { id: newId(), role_slug: "professional", sport: null, document: documentTypes[0]?.slug ?? "", is_required: true, description: "", sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 },
            ],
          }))
        }
      >
        <Plus className="h-4 w-4" /> Add requirement
      </button>
    </div>
  );
}

function HistoryTab({ versions }: { versions: CatalogVersionRow[] }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {versions.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
          <span className="font-medium">{v.version ? `v${v.version}` : `Draft from v${v.base_version}`}</span>
          <StatusPill status={v.status} />
          <span className="text-xs text-text-secondary">{v.notes}</span>
          <span className="ml-auto text-xs text-text-hint">
            {v.published_at ? `published ${new Date(v.published_at).toLocaleString()}` : v.updated_at ? `updated ${new Date(v.updated_at).toLocaleString()}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
