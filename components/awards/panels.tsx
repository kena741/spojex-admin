"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Minus, Pencil, Plus, ShieldAlert, Trash2, Upload } from "lucide-react";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import {
  EVENT_STATUSES,
  NOMINATION_STATUSES,
  formatNumber,
  formatWhen,
  fromLocalInput,
  statusTone,
  toLocalInput,
  type AwardCategoryRow,
  type AwardEventDetail,
  type AwardEventRow,
  type AwardIntegrity,
  type AwardLeaderboardRow,
  type AwardPackageRow,
  type AwardParticipantRow,
  type AwardResultGroup,
} from "@/lib/awards";
import { adminFetch, deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60";
export const labelClass = "mb-1.5 block text-sm font-medium text-foreground";
const btn =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50";
const primaryBtn =
  "inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50";

const API = "/api/admin/awards";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-text-secondary">{hint}</p> : null}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

// ── Settings ────────────────────────────────────────────────────────────────

function AwardImagePicker({
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
          <p className="text-xs text-text-secondary">{hint || "JPG, PNG, WebP, or GIF · up to 5 MB"}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              className="hidden"
              disabled={disabled || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPick(file);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : previewUrl ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
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

export function EventSettingsPanel({
  event,
  canWrite,
  onSaved,
}: {
  event: AwardEventRow;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => toForm(event));
  const [uploadingKind, setUploadingKind] = useState<"cover" | "banner" | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const { busy, error, run, setError } = useAction();
  useEffect(() => setForm(toForm(event)), [event]);
  const set = (patch: Partial<ReturnType<typeof toForm>>) => setForm((f) => ({ ...f, ...patch }));

  const save = () =>
    run(async () => {
      await patchAdmin(`${API}/events/${event.id}`, {
        title: form.title,
        description: form.description,
        cover_url: form.cover_url,
        banner_url: form.banner_url,
        starts_at: fromLocalInput(form.starts_at),
        ends_at: fromLocalInput(form.ends_at),
        voting_starts_at: fromLocalInput(form.voting_starts_at),
        voting_ends_at: fromLocalInput(form.voting_ends_at),
        status: form.status,
        is_featured: form.is_featured,
        leaderboard_public: form.leaderboard_public,
        max_votes_per_request: Number(form.max_votes_per_request),
        rate_limit_per_minute: Number(form.rate_limit_per_minute),
      });
      onSaved();
    });

  const togglePublish = () =>
    run(async () => {
      await postAdmin(`${API}/events/${event.id}/${event.is_published ? "unpublish" : "publish"}`, {});
      onSaved();
    });

  const uploadImage = async (kind: "cover" | "banner", file: File) => {
    if (!canWrite) return;
    setUploadingKind(kind);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const response = await adminFetch(`${API}/events/${event.id}/image`, {
        method: "POST",
        body,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        cover_url?: string;
        banner_url?: string;
        image_url?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      const nextUrl = payload.image_url || (kind === "cover" ? payload.cover_url : payload.banner_url) || "";
      if (kind === "cover") set({ cover_url: nextUrl || form.cover_url });
      else set({ banner_url: nextUrl || form.banner_url });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingKind(null);
    }
  };

  const clearImage = async (kind: "cover" | "banner") => {
    if (!canWrite) return;
    setUploadingKind(kind);
    setError(null);
    try {
      const response = await adminFetch(`${API}/events/${event.id}/image?kind=${kind}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Remove failed");
      if (kind === "cover") set({ cover_url: "" });
      else set({ banner_url: "" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploadingKind(null);
    }
  };

  const d = !canWrite;
  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5">
      {error ? <AdminErrorAlert message={error} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusTone(event.effective_status)}>Now: {event.effective_status}</StatusBadge>
        <StatusBadge tone={event.is_published ? "success" : "neutral"}>
          {event.is_published ? "Published" : "Unpublished"}
        </StatusBadge>
        {event.results_published ? <StatusBadge tone="success">Results published</StatusBadge> : null}
        {canWrite ? (
          <button type="button" className={cn(btn, "ml-auto")} disabled={busy || Boolean(uploadingKind)} onClick={togglePublish}>
            {event.is_published ? "Unpublish" : "Publish"}
          </button>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title">
          <input className={fieldClass} disabled={d} value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Status" hint="Upcoming/Active advance automatically with the voting dates.">
          <select className={fieldClass} disabled={d} value={form.status} onChange={(e) => set({ status: e.target.value })}>
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <textarea
              className={`${fieldClass} h-24 py-2`}
              disabled={d}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </Field>
        </div>
        <AwardImagePicker
          label="Cover image"
          hint="Card / list thumbnail in the app. JPG/PNG/WebP/GIF · 5 MB."
          previewUrl={form.cover_url.trim()}
          inputRef={coverInputRef}
          disabled={d}
          uploading={uploadingKind === "cover"}
          onPick={(file) => void uploadImage("cover", file)}
          onRemoveRemote={canWrite && form.cover_url.trim() ? () => clearImage("cover") : undefined}
        />
        <AwardImagePicker
          label="Banner image"
          hint="Wide hero for the event detail screen. JPG/PNG/WebP/GIF · 5 MB."
          previewUrl={form.banner_url.trim()}
          inputRef={bannerInputRef}
          disabled={d}
          uploading={uploadingKind === "banner"}
          onPick={(file) => void uploadImage("banner", file)}
          onRemoveRemote={canWrite && form.banner_url.trim() ? () => clearImage("banner") : undefined}
        />
        <Field label="Event starts">
          <input type="datetime-local" className={fieldClass} disabled={d} value={form.starts_at} onChange={(e) => set({ starts_at: e.target.value })} />
        </Field>
        <Field label="Event ends">
          <input type="datetime-local" className={fieldClass} disabled={d} value={form.ends_at} onChange={(e) => set({ ends_at: e.target.value })} />
        </Field>
        <Field label="Voting starts">
          <input type="datetime-local" className={fieldClass} disabled={d} value={form.voting_starts_at} onChange={(e) => set({ voting_starts_at: e.target.value })} />
        </Field>
        <Field label="Voting ends">
          <input type="datetime-local" className={fieldClass} disabled={d} value={form.voting_ends_at} onChange={(e) => set({ voting_ends_at: e.target.value })} />
        </Field>
        <Field label="Max votes per request" hint="Caps one vote action (abuse guard).">
          <input type="number" min={1} className={fieldClass} disabled={d} value={form.max_votes_per_request} onChange={(e) => set({ max_votes_per_request: e.target.value })} />
        </Field>
        <Field label="Vote requests per minute per user" hint="Requests above this are rejected and flagged.">
          <input type="number" min={1} className={fieldClass} disabled={d} value={form.rate_limit_per_minute} onChange={(e) => set({ rate_limit_per_minute: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-6">
        <Check label="Featured in the app" checked={form.is_featured} disabled={d} onChange={(v) => set({ is_featured: v })} />
        <Check
          label="Public leaderboard (otherwise hidden until voting closes)"
          checked={form.leaderboard_public}
          disabled={d}
          onChange={(v) => set({ leaderboard_public: v })}
        />
      </div>
      {canWrite ? (
        <div className="flex justify-end">
          <button type="button" className={primaryBtn} disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save event"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function toForm(e: AwardEventRow) {
  return {
    title: e.title ?? "",
    description: e.description ?? "",
    cover_url: e.cover_url ?? "",
    banner_url: e.banner_url ?? "",
    starts_at: toLocalInput(e.starts_at),
    ends_at: toLocalInput(e.ends_at),
    voting_starts_at: toLocalInput(e.voting_starts_at),
    voting_ends_at: toLocalInput(e.voting_ends_at),
    status: String(e.status ?? "draft"),
    is_featured: Boolean(e.is_featured),
    leaderboard_public: e.leaderboard_public !== false,
    max_votes_per_request: String(e.max_votes_per_request ?? 100),
    rate_limit_per_minute: String(e.rate_limit_per_minute ?? 20),
  };
}

// ── Categories ──────────────────────────────────────────────────────────────

type CategoryForm = {
  name: string;
  description: string;
  image_url: string;
  sort_order: string;
  voting_starts_at: string;
  voting_ends_at: string;
  free_votes_per_period: string;
  free_vote_period: string;
  paid_votes_enabled: boolean;
  leaderboard_public: string;
  is_active: boolean;
};

function categoryForm(c?: AwardCategoryRow): CategoryForm {
  return {
    name: c?.name ?? "",
    description: c?.description ?? "",
    image_url: c?.image_url ?? "",
    sort_order: String(c?.sort_order ?? 0),
    voting_starts_at: toLocalInput(c?.voting_starts_at),
    voting_ends_at: toLocalInput(c?.voting_ends_at),
    free_votes_per_period: String(c?.free_votes_per_period ?? 1),
    free_vote_period: c?.free_vote_period ?? "daily",
    paid_votes_enabled: c?.paid_votes_enabled ?? true,
    leaderboard_public: c?.leaderboard_public == null ? "inherit" : c.leaderboard_public ? "public" : "hidden",
    is_active: c?.is_active ?? true,
  };
}

export function CategoriesPanel({
  detail,
  canWrite,
  onChanged,
}: {
  detail: AwardEventDetail;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<AwardCategoryRow | "new" | null>(null);
  const { error, run } = useAction();
  const remove = (c: AwardCategoryRow) => {
    if (!window.confirm(`Delete category “${c.name}”? Categories with votes can only be deactivated.`)) return;
    void run(async () => {
      await deleteAdmin(`${API}/categories/${c.id}`);
      onChanged();
    });
  };
  return (
    <div className="space-y-3">
      {error ? <AdminErrorAlert message={error} /> : null}
      {canWrite ? (
        <button type="button" className={primaryBtn} onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add category
        </button>
      ) : null}
      {detail.categories.length === 0 ? (
        <AdminEmpty title="No categories" description="Add categories like Best Player or Goal of the Season." />
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-xs text-text-secondary">
            <tr>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Voting</th>
              <th className="px-4 py-2">Free votes</th>
              <th className="px-4 py-2">Paid</th>
              <th className="px-4 py-2">Nominees</th>
              <th className="px-4 py-2">Votes</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {detail.categories.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-2">
                  <div className="font-medium">{c.name}</div>
                  {!c.is_active ? <StatusBadge tone="warning">inactive</StatusBadge> : null}
                </td>
                <td className="px-4 py-2 text-xs">
                  <StatusBadge tone={statusTone(c.voting_state === "open" ? "active" : c.voting_state)}>
                    {c.voting_state ?? "—"}
                  </StatusBadge>
                  <div className="mt-1 text-text-secondary">
                    {c.voting_starts_at || c.voting_ends_at
                      ? `${formatWhen(c.voting_starts_at)} → ${formatWhen(c.voting_ends_at)}`
                      : "Event dates"}
                  </div>
                </td>
                <td className="px-4 py-2">
                  {c.free_votes_per_period} / {c.free_vote_period === "event" ? "event" : c.free_vote_period.replace("ly", "")}
                </td>
                <td className="px-4 py-2">{c.paid_votes_enabled ? "On" : "Off"}</td>
                <td className="px-4 py-2">{formatNumber(c.nominee_count)}</td>
                <td className="px-4 py-2">{formatNumber(c.total_votes)}</td>
                <td className="px-4 py-2 text-right">
                  {canWrite ? (
                    <div className="flex justify-end gap-1">
                      <button type="button" className={btn} onClick={() => setEditing(c)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" className={btn} onClick={() => remove(c)} aria-label="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing ? (
        <CategoryModal
          eventId={detail.event.id}
          category={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function CategoryModal({
  eventId,
  category,
  onClose,
  onSaved,
}: {
  eventId: string;
  category?: AwardCategoryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(() => categoryForm(category));
  const { busy, error, run } = useAction();
  const set = (patch: Partial<CategoryForm>) => setF((cur) => ({ ...cur, ...patch }));
  const save = () =>
    run(async () => {
      const body = {
        name: f.name,
        description: f.description,
        image_url: f.image_url,
        sort_order: Number(f.sort_order) || 0,
        voting_starts_at: fromLocalInput(f.voting_starts_at),
        voting_ends_at: fromLocalInput(f.voting_ends_at),
        free_votes_per_period: Number(f.free_votes_per_period) || 0,
        free_vote_period: f.free_vote_period,
        paid_votes_enabled: f.paid_votes_enabled,
        leaderboard_public: f.leaderboard_public === "inherit" ? null : f.leaderboard_public === "public",
        is_active: f.is_active,
      };
      if (category) await patchAdmin(`${API}/categories/${category.id}`, body);
      else await postAdmin(`${API}/events/${eventId}/categories`, body);
      onSaved();
    });
  return (
    <AdminModal
      open
      title={category ? "Edit category" : "New category"}
      onClose={onClose}
      className="max-w-2xl"
      footer={<AdminModalFooter onCancel={onClose} onSave={save} saving={busy} disabled={!f.name.trim()} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {error ? (
          <div className="sm:col-span-2">
            <AdminErrorAlert message={error} />
          </div>
        ) : null}
        <Field label="Name">
          <input className={fieldClass} value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Sort order">
          <input type="number" className={fieldClass} value={f.sort_order} onChange={(e) => set({ sort_order: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea className={`${fieldClass} h-20 py-2`} value={f.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Image URL">
            <input className={fieldClass} value={f.image_url} onChange={(e) => set({ image_url: e.target.value })} />
          </Field>
        </div>
        <Field label="Voting starts" hint="Empty = event voting dates.">
          <input type="datetime-local" className={fieldClass} value={f.voting_starts_at} onChange={(e) => set({ voting_starts_at: e.target.value })} />
        </Field>
        <Field label="Voting ends">
          <input type="datetime-local" className={fieldClass} value={f.voting_ends_at} onChange={(e) => set({ voting_ends_at: e.target.value })} />
        </Field>
        <Field label="Free votes per period" hint="0 turns free voting off.">
          <input type="number" min={0} className={fieldClass} value={f.free_votes_per_period} onChange={(e) => set({ free_votes_per_period: e.target.value })} />
        </Field>
        <Field label="Free vote period">
          <select className={fieldClass} value={f.free_vote_period} onChange={(e) => set({ free_vote_period: e.target.value })}>
            <option value="daily">Daily (resets at midnight EAT)</option>
            <option value="weekly">Weekly (resets Monday)</option>
            <option value="event">Whole event</option>
          </select>
        </Field>
        <Field label="Leaderboard">
          <select className={fieldClass} value={f.leaderboard_public} onChange={(e) => set({ leaderboard_public: e.target.value })}>
            <option value="inherit">Same as event</option>
            <option value="public">Public</option>
            <option value="hidden">Hidden until voting closes</option>
          </select>
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <Check label="Paid votes enabled" checked={f.paid_votes_enabled} onChange={(v) => set({ paid_votes_enabled: v })} />
          <Check label="Active" checked={f.is_active} onChange={(v) => set({ is_active: v })} />
        </div>
      </div>
    </AdminModal>
  );
}

// ── Participants ────────────────────────────────────────────────────────────

export function ParticipantsPanel({
  detail,
  canWrite,
  onChanged,
}: {
  detail: AwardEventDetail;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<AwardParticipantRow | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const { error, run } = useAction();
  const catName = (id: string) => detail.categories.find((c) => c.id === id)?.name ?? "—";

  const setNomination = (nominationId: string, status: string) =>
    run(async () => {
      await patchAdmin(`${API}/nominations/${nominationId}`, { status });
      onChanged();
    });
  const remove = (p: AwardParticipantRow) => {
    if (!window.confirm(`Delete ${p.name}? Participants with votes can only be withdrawn.`)) return;
    void run(async () => {
      await deleteAdmin(`${API}/participants/${p.id}`);
      onChanged();
    });
  };

  return (
    <div className="space-y-3">
      {error ? <AdminErrorAlert message={error} /> : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryBtn} onClick={() => setEditing("new")} disabled={!detail.categories.length}>
            <Plus className="h-4 w-4" /> Add participant
          </button>
          <button type="button" className={btn} onClick={() => setImporting(true)} disabled={!detail.categories.length}>
            <Upload className="h-4 w-4" /> Bulk import (CSV)
          </button>
        </div>
      ) : null}
      {detail.participants.length === 0 ? (
        <AdminEmpty title="No participants" description="Add nominees manually or import a CSV." />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {detail.participants.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              {p.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted font-semibold">
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{p.name}</span>
                  {p.is_featured ? <StatusBadge tone="info">Featured</StatusBadge> : null}
                </div>
                <p className="truncate text-xs text-text-secondary">{p.organization || "—"}</p>
                {p.user_email || p.user_username ? (
                  <p className="truncate text-xs text-text-secondary">
                    Linked · {p.user_email || `@${p.user_username}`}
                  </p>
                ) : null}
                <p className="text-xs text-text-secondary">{formatNumber(p.total_votes)} votes</p>
              </div>
              {canWrite ? (
                <div className="flex gap-1">
                  <button type="button" className={btn} onClick={() => setEditing(p)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" className={btn} onClick={() => remove(p)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
            <div className="mt-3 space-y-1.5">
              {(p.nominations ?? []).map((n) => (
                <div key={n.nomination_id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">
                    {catName(n.category_id)} · {formatNumber(n.total_votes)} votes
                  </span>
                  {canWrite ? (
                    <select
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      value={n.status}
                      onChange={(e) => setNomination(n.nomination_id, e.target.value)}
                    >
                      {NOMINATION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <StatusBadge tone={statusTone(n.status)}>{n.status}</StatusBadge>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {editing ? (
        <ParticipantModal
          detail={detail}
          participant={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
      {importing ? (
        <BulkImportModal
          eventId={detail.event.id}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function ParticipantModal({
  detail,
  participant,
  onClose,
  onSaved,
}: {
  detail: AwardEventDetail;
  participant?: AwardParticipantRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = new Set((participant?.nominations ?? []).map((n) => n.category_id));
  const [f, setF] = useState({
    name: participant?.name ?? "",
    photo_url: participant?.photo_url ?? "",
    bio: participant?.bio ?? "",
    organization: participant?.organization ?? "",
    email: participant?.user_email || (participant?.user_username ? `@${participant.user_username}` : ""),
    is_featured: participant?.is_featured ?? false,
    social: Object.entries(participant?.social_links ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
    categories: new Set<string>(existing),
  });
  const { busy, error, run } = useAction();
  const canSave = Boolean(f.name.trim() || f.email.trim());
  const save = () =>
    run(async () => {
      const social: Record<string, string> = {};
      for (const line of f.social.split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) social[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      const body = {
        name: f.name.trim() || undefined,
        photo_url: f.photo_url,
        bio: f.bio,
        organization: f.organization,
        is_featured: f.is_featured,
        social_links: social,
        email: f.email.trim() || null,
        // Adding a category nominates; removing is done by withdrawing the nomination.
        category_ids: [...f.categories].filter((id) => !existing.has(id)),
      };
      if (participant) await patchAdmin(`${API}/participants/${participant.id}`, body);
      else await postAdmin(`${API}/events/${detail.event.id}/participants`, body);
      onSaved();
    });
  return (
    <AdminModal
      open
      title={participant ? "Edit participant" : "New participant"}
      onClose={onClose}
      className="max-w-2xl"
      footer={<AdminModalFooter onCancel={onClose} onSave={save} saving={busy} disabled={!canSave} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {error ? (
          <div className="sm:col-span-2">
            <AdminErrorAlert message={error} />
          </div>
        ) : null}
        <Field label="Name" hint="Optional if you link a Spojex email — filled from their profile.">
          <input className={fieldClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Organization / team">
          <input className={fieldClass} value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Spojex email or username" hint="Links the nominee to their Spojex account for notifications.">
            <input
              className={fieldClass}
              type="text"
              autoComplete="email"
              placeholder="name@example.com or @username"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Photo URL">
            <input className={fieldClass} value={f.photo_url} onChange={(e) => setF({ ...f, photo_url: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Bio">
            <textarea className={`${fieldClass} h-20 py-2`} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
          </Field>
        </div>
        <Field label="Social links" hint="One per line, e.g. instagram: https://…">
          <textarea className={`${fieldClass} h-20 py-2`} value={f.social} onChange={(e) => setF({ ...f, social: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <p className={labelClass}>Categories</p>
          <div className="flex flex-wrap gap-3">
            {detail.categories.map((c) => (
              <Check
                key={c.id}
                label={c.name}
                checked={f.categories.has(c.id)}
                disabled={existing.has(c.id)}
                onChange={(v) => {
                  const next = new Set(f.categories);
                  if (v) next.add(c.id);
                  else next.delete(c.id);
                  setF({ ...f, categories: next });
                }}
              />
            ))}
          </div>
        </div>
        <Check label="Featured participant" checked={f.is_featured} onChange={(v) => setF({ ...f, is_featured: v })} />
      </div>
    </AdminModal>
  );
}

function BulkImportModal({ eventId, onClose, onDone }: { eventId: string; onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState("name,email,organization,photo_url,bio,categories,social_instagram\n");
  const [result, setResult] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const save = () =>
    run(async () => {
      const out = (await postAdmin(`${API}/events/${eventId}/participants/bulk`, { csv })) as {
        created: number;
        nominations: number;
      };
      setResult(`Imported ${out.created} participants and ${out.nominations} nominations.`);
      onDone();
    });
  return (
    <AdminModal
      open
      title="Bulk import participants"
      onClose={onClose}
      className="max-w-2xl"
      footer={<AdminModalFooter onCancel={onClose} onSave={save} saving={busy} saveLabel="Import" />}
    >
      <div className="space-y-3">
        {error ? <AdminErrorAlert message={error} /> : null}
        {result ? <p className="text-sm text-emerald-700">{result}</p> : null}
        <p className="text-xs text-text-secondary">
          CSV with a header row. <code>categories</code> lists category names separated by <code>|</code>. Columns named{" "}
          <code>social_&lt;network&gt;</code> become social links.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setCsv(await file.text());
          }}
        />
        <textarea className={`${fieldClass} h-56 py-2 font-mono text-xs`} value={csv} onChange={(e) => setCsv(e.target.value)} />
      </div>
    </AdminModal>
  );
}

// ── Packages ────────────────────────────────────────────────────────────────

export function PackagesPanel({
  detail,
  canWrite,
  onChanged,
}: {
  detail: AwardEventDetail;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<AwardPackageRow | "new" | null>(null);
  const { error, run } = useAction();
  const toggle = (p: AwardPackageRow) =>
    run(async () => {
      await patchAdmin(`${API}/packages/${p.id}`, { is_active: !p.is_active });
      onChanged();
    });
  const presets = [
    { name: "Basic", votes: 5, price_etb: 10 },
    { name: "Standard", votes: 10, price_etb: 18 },
    { name: "Premium", votes: 50, price_etb: 80 },
    { name: "Ultimate", votes: 100, price_etb: 150 },
  ];
  const addPresets = () =>
    run(async () => {
      for (const [i, p] of presets.entries()) {
        await postAdmin(`${API}/events/${detail.event.id}/packages`, { ...p, sort_order: i, min_quantity: 1, max_quantity: 10 });
      }
      onChanged();
    });
  return (
    <div className="space-y-3">
      {error ? <AdminErrorAlert message={error} /> : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryBtn} onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add package
          </button>
          {detail.packages.length === 0 ? (
            <button type="button" className={btn} onClick={addPresets}>
              Add Basic / Standard / Premium / Ultimate
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-text-secondary">
        Paid through Chapa / Telebirr. Vote credits are issued only after the payment is verified.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left text-xs text-text-secondary">
            <tr>
              <th className="px-4 py-2">Package</th>
              <th className="px-4 py-2">Votes</th>
              <th className="px-4 py-2">Price (ETB)</th>
              <th className="px-4 py-2">Qty limits</th>
              <th className="px-4 py-2">Scope</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {detail.packages.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2">{formatNumber(p.votes)}</td>
                <td className="px-4 py-2">{Number(p.price_etb).toFixed(2)}</td>
                <td className="px-4 py-2">
                  {p.min_quantity}–{p.max_quantity}
                </td>
                <td className="px-4 py-2">
                  {p.category_id ? detail.categories.find((c) => c.id === p.category_id)?.name ?? "Category" : "All categories"}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "Enabled" : "Disabled"}</StatusBadge>
                </td>
                <td className="px-4 py-2 text-right">
                  {canWrite ? (
                    <div className="flex justify-end gap-1">
                      <button type="button" className={btn} onClick={() => toggle(p)}>
                        {p.is_active ? "Disable" : "Enable"}
                      </button>
                      <button type="button" className={btn} onClick={() => setEditing(p)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing ? (
        <PackageModal
          detail={detail}
          pkg={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function PackageModal({
  detail,
  pkg,
  onClose,
  onSaved,
}: {
  detail: AwardEventDetail;
  pkg?: AwardPackageRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: pkg?.name ?? "",
    votes: String(pkg?.votes ?? 10),
    price_etb: String(pkg?.price_etb ?? 20),
    min_quantity: String(pkg?.min_quantity ?? 1),
    max_quantity: String(pkg?.max_quantity ?? 10),
    sort_order: String(pkg?.sort_order ?? 0),
    category_id: pkg?.category_id ?? "",
    is_active: pkg?.is_active ?? true,
  });
  const { busy, error, run } = useAction();
  const save = () =>
    run(async () => {
      const body = {
        name: f.name,
        votes: Number(f.votes),
        price_etb: Number(f.price_etb),
        min_quantity: Number(f.min_quantity),
        max_quantity: Number(f.max_quantity),
        sort_order: Number(f.sort_order) || 0,
        category_id: f.category_id || null,
        is_active: f.is_active,
      };
      if (pkg) await patchAdmin(`${API}/packages/${pkg.id}`, body);
      else await postAdmin(`${API}/events/${detail.event.id}/packages`, body);
      onSaved();
    });
  return (
    <AdminModal
      open
      title={pkg ? "Edit package" : "New vote package"}
      onClose={onClose}
      footer={<AdminModalFooter onCancel={onClose} onSave={save} saving={busy} disabled={!f.name.trim()} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {error ? (
          <div className="sm:col-span-2">
            <AdminErrorAlert message={error} />
          </div>
        ) : null}
        <Field label="Name">
          <input className={fieldClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Votes per package">
          <input type="number" min={1} className={fieldClass} value={f.votes} onChange={(e) => setF({ ...f, votes: e.target.value })} />
        </Field>
        <Field label="Price (ETB)">
          <input type="number" min={0} step="0.01" className={fieldClass} value={f.price_etb} onChange={(e) => setF({ ...f, price_etb: e.target.value })} />
        </Field>
        <Field label="Sort order">
          <input type="number" className={fieldClass} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} />
        </Field>
        <Field label="Min quantity">
          <input type="number" min={1} className={fieldClass} value={f.min_quantity} onChange={(e) => setF({ ...f, min_quantity: e.target.value })} />
        </Field>
        <Field label="Max quantity">
          <input type="number" min={1} className={fieldClass} value={f.max_quantity} onChange={(e) => setF({ ...f, max_quantity: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Category" hint="A category package gives credits usable only in that category.">
            <select className={fieldClass} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
              <option value="">All categories</option>
              {detail.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Check label="Enabled" checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} />
      </div>
    </AdminModal>
  );
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

export function LeaderboardPanel({ detail }: { detail: AwardEventDetail }) {
  const [categoryId, setCategoryId] = useState(detail.categories[0]?.id ?? "");
  const [rows, setRows] = useState<AwardLeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    (async () => {
      const res = await adminFetch(`${API}/categories/${categoryId}/leaderboard`);
      const payload = (await res.json().catch(() => ({}))) as { data?: { rows: AwardLeaderboardRow[] }; error?: string };
      if (cancelled) return;
      if (!res.ok) setError(payload.error || "Could not load leaderboard");
      else setRows(payload.data?.rows ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);
  return (
    <div className="space-y-3">
      <select className={cn(fieldClass, "sm:w-72")} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        {detail.categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {error ? <AdminErrorAlert message={error} /> : null}
      {!rows && !error && categoryId ? <AdminLoadingRow label="Loading leaderboard…" /> : null}
      {rows ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted text-left text-xs text-text-secondary">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Nominee</th>
                <th className="px-4 py-2">Votes</th>
                <th className="px-4 py-2">Free / Paid</th>
                <th className="px-4 py-2">Share</th>
                <th className="px-4 py-2">Move</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.nomination_id} className="border-t border-border">
                  <td className="px-4 py-2 font-semibold">{r.rank}</td>
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2">{formatNumber(r.total_votes)}</td>
                  <td className="px-4 py-2 text-xs">
                    {formatNumber(r.free_votes)} / {formatNumber(r.paid_votes)}
                  </td>
                  <td className="px-4 py-2">{r.percentage.toFixed(1)}%</td>
                  <td className="px-4 py-2">
                    {r.change > 0 ? (
                      <span className="inline-flex items-center text-emerald-700">
                        <ArrowUp className="h-3 w-3" />
                        {r.change}
                      </span>
                    ) : r.change < 0 ? (
                      <span className="inline-flex items-center text-red-700">
                        <ArrowDown className="h-3 w-3" />
                        {-r.change}
                      </span>
                    ) : (
                      <Minus className="h-3 w-3 text-text-secondary" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// ── Results / winners ───────────────────────────────────────────────────────

export function ResultsPanel({ detail, canResults }: { detail: AwardEventDetail; canResults: boolean }) {
  const [data, setData] = useState<{ results: AwardResultGroup[]; integrity: AwardIntegrity[] } | null>(null);
  const [force, setForce] = useState(false);
  const [winners, setWinners] = useState("1");
  const { busy, error, run, setError } = useAction();
  const eventId = detail.event.id;

  const load = async () => {
    const res = await adminFetch(`${API}/events/${eventId}/results`);
    const payload = (await res.json().catch(() => ({}))) as {
      data?: { results: AwardResultGroup[]; integrity: AwardIntegrity[] };
      error?: string;
    };
    if (!res.ok) setError(payload.error || "Could not load results");
    else setData(payload.data ?? { results: [], integrity: [] });
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const act = (path: string, body: Record<string, unknown> = {}) =>
    run(async () => {
      await postAdmin(`${API}/events/${eventId}/results/${path}`, body);
      await load();
    });

  const integrity = new Map((data?.integrity ?? []).map((i) => [i.category_id, i]));
  return (
    <div className="space-y-4">
      {error ? <AdminErrorAlert message={error} /> : null}
      {canResults ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
          <Field label="Winners per category">
            <input type="number" min={1} max={10} className={cn(fieldClass, "w-28")} value={winners} onChange={(e) => setWinners(e.target.value)} />
          </Field>
          <Check label="Preview while voting is open" checked={force} onChange={setForce} />
          <button type="button" className={btn} disabled={busy} onClick={() => act("compute", { force, winners: Number(winners) || 1 })}>
            Compute results
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => act("approve", {})}>
            <CheckCircle2 className="h-4 w-4" /> Approve all
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => act("unapprove", {})}>
            Reopen approved
          </button>
          <button
            type="button"
            className={primaryBtn}
            disabled={busy}
            onClick={() => {
              if (window.confirm("Publish winners? Voters and winners are notified and the results become public.")) {
                void act("publish");
              }
            }}
          >
            Publish winners
          </button>
        </div>
      ) : null}
      {!data ? <AdminLoadingRow label="Loading results…" /> : null}
      {data && data.results.length === 0 ? (
        <AdminEmpty title="No results yet" description="Results are computed from the vote ledger after voting closes." />
      ) : null}
      {data?.results.map((g) => {
        const check = integrity.get(g.category_id);
        return (
          <div key={g.category_id} className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <h3 className="font-semibold">{g.category_name}</h3>
              <StatusBadge tone={statusTone(g.status)}>{g.status}</StatusBadge>
              {check ? (
                check.matches ? (
                  <StatusBadge tone="success">Ledger verified</StatusBadge>
                ) : (
                  <StatusBadge tone="danger">
                    <ShieldAlert className="mr-1 inline h-3 w-3" />
                    Ledger changed since compute
                  </StatusBadge>
                )
              ) : null}
              {canResults && g.status === "computed" ? (
                <button type="button" className={cn(btn, "ml-auto")} disabled={busy} onClick={() => act("approve", { category_id: g.category_id })}>
                  Approve category
                </button>
              ) : null}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {g.rows.map((r) => (
                  <ResultRow key={r.id} row={r} canEdit={canResults} onSaved={load} />
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function ResultRow({
  row,
  canEdit,
  onSaved,
}: {
  row: AwardResultGroup["rows"][number];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [prize, setPrize] = useState(row.prize ?? "");
  const [cert, setCert] = useState(row.certificate_url ?? "");
  const { busy, run } = useAction();
  const dirty = prize !== (row.prize ?? "") || cert !== (row.certificate_url ?? "");
  return (
    <tr className="border-t border-border">
      <td className="w-12 px-4 py-2 font-semibold">{row.rank}</td>
      <td className="px-4 py-2">
        {row.participant_name} {row.is_winner ? <span title="Winner">🏆</span> : null}
        <div className="text-xs text-text-secondary">
          {formatNumber(row.total_votes)} votes · {row.percentage.toFixed(1)}%
        </div>
      </td>
      <td className="px-4 py-2">
        {row.is_winner && canEdit ? (
          <div className="flex flex-wrap gap-2">
            <input className={cn(fieldClass, "h-8 w-40")} placeholder="Prize" value={prize} onChange={(e) => setPrize(e.target.value)} />
            <input className={cn(fieldClass, "h-8 w-56")} placeholder="Certificate URL" value={cert} onChange={(e) => setCert(e.target.value)} />
            {dirty ? (
              <button
                type="button"
                className={btn}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await patchAdmin(`${API}/results/${row.id}`, { prize, certificate_url: cert });
                    onSaved();
                  })
                }
              >
                Save
              </button>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-text-secondary">{row.prize}</span>
        )}
      </td>
    </tr>
  );
}

// ── Announcements & abuse flags ─────────────────────────────────────────────

type FlagRow = {
  id: string;
  user_id: string;
  display_name?: string;
  username?: string;
  reason: string;
  detail: Record<string, unknown>;
  ip: string;
  created_at: string;
};

export function EngagePanel({ detail, canWrite }: { detail: AwardEventDetail; canWrite: boolean }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [flags, setFlags] = useState<FlagRow[] | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => {
    (async () => {
      const res = await adminFetch(`${API}/events/${detail.event.id}/flags`);
      const payload = (await res.json().catch(() => ({}))) as { data?: { flags: FlagRow[] } };
      setFlags(payload.data?.flags ?? []);
    })();
  }, [detail.event.id]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">Send announcement</h3>
        <p className="text-xs text-text-secondary">Goes to everyone who voted in this event (respecting their awards notification settings).</p>
        {error ? <AdminErrorAlert message={error} /> : null}
        {sent ? <p className="text-sm text-emerald-700">{sent}</p> : null}
        <input className={fieldClass} placeholder="Title" value={title} maxLength={120} disabled={!canWrite} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={`${fieldClass} h-24 py-2`} placeholder="Message" maxLength={500} disabled={!canWrite} value={body} onChange={(e) => setBody(e.target.value)} />
        <button
          type="button"
          className={primaryBtn}
          disabled={!canWrite || busy || !title.trim() || !body.trim()}
          onClick={() =>
            run(async () => {
              const out = (await postAdmin(`${API}/events/${detail.event.id}/announce`, { title, body })) as {
                recipients: number;
              };
              setSent(`Sent to ${out.recipients} voters.`);
              setTitle("");
              setBody("");
            })
          }
        >
          Send
        </button>
      </div>
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">Abuse flags</h3>
        {!flags ? <AdminLoadingRow label="Loading flags…" /> : null}
        {flags && flags.length === 0 ? <p className="text-sm text-text-secondary">No flags.</p> : null}
        <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
          {flags?.map((f) => (
            <li key={f.id} className="rounded-lg border border-border p-2">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{f.display_name || f.username || f.user_id}</span>
                <span className="text-xs text-text-secondary">{formatWhen(f.created_at)}</span>
              </div>
              <div className="text-xs text-text-secondary">
                {f.reason} · {f.ip || "no ip"} · {JSON.stringify(f.detail)}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
