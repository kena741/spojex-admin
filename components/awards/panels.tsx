"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Pencil, Plus, ShieldAlert, Trash2, Upload } from "lucide-react";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import {
  NOMINATION_LABELS,
  NOMINATION_STATUSES,
  RESULT_STATUS_LABELS,
  eventStatusLabel,
  formatNumber,
  fromLocalInput,
  openVotingPatch,
  statusTone,
  toLocalInput,
  votingStateLabel,
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

// ── Event ───────────────────────────────────────────────────────────────────

function CoverPicker({
  previewUrl,
  inputRef,
  disabled,
  uploading,
  onPick,
  onRemove,
}: {
  previewUrl: string;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  uploading?: boolean;
  onPick: (file: File) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-20 w-32 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-text-secondary">No image</div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = "";
        }}
      />
      <button type="button" className={btn} disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
        <Upload className="h-3.5 w-3.5" />
        {uploading ? "Uploading…" : previewUrl ? "Replace" : "Upload"}
      </button>
      {previewUrl && onRemove ? (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={onRemove}
          className="text-xs text-text-secondary underline disabled:opacity-60"
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

function toForm(e: AwardEventRow) {
  return {
    title: e.title ?? "",
    description: e.description ?? "",
    cover_url: e.cover_url ?? "",
    voting_starts_at: toLocalInput(e.voting_starts_at),
    voting_ends_at: toLocalInput(e.voting_ends_at),
    leaderboard_public: e.leaderboard_public !== false,
  };
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
  const [uploading, setUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const { busy, error, run, setError } = useAction();
  useEffect(() => setForm(toForm(event)), [event]);
  const set = (patch: Partial<ReturnType<typeof toForm>>) => setForm((f) => ({ ...f, ...patch }));

  const status = event.effective_status ?? event.status;
  const live = event.is_published && !event.results_published && status !== "cancelled";
  const canOpen = live && (status === "upcoming" || status === "completed");
  const canClose = live && status === "active";

  const save = () =>
    run(async () => {
      await patchAdmin(`${API}/events/${event.id}`, {
        title: form.title,
        description: form.description,
        voting_starts_at: fromLocalInput(form.voting_starts_at),
        voting_ends_at: fromLocalInput(form.voting_ends_at),
        leaderboard_public: form.leaderboard_public,
      });
      onSaved();
    });

  const togglePublish = () =>
    run(async () => {
      await postAdmin(`${API}/events/${event.id}/${event.is_published ? "unpublish" : "publish"}`, {});
      onSaved();
    });

  const setVoting = (open: boolean) => {
    if (!open && !window.confirm("Close voting now? Voters can no longer vote.")) return;
    void run(async () => {
      await patchAdmin(`${API}/events/${event.id}`, open ? openVotingPatch(event) : { status: "completed" });
      onSaved();
    });
  };

  const changeCover = async (file: File | null) => {
    if (!canWrite) return;
    setUploading(true);
    setError(null);
    try {
      let response: Response;
      if (file) {
        const body = new FormData();
        body.append("file", file);
        body.append("kind", "cover");
        response = await adminFetch(`${API}/events/${event.id}/image`, { method: "POST", body });
      } else {
        response = await adminFetch(`${API}/events/${event.id}/image?kind=cover`, { method: "DELETE" });
      }
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        cover_url?: string;
        image_url?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Image update failed");
      set({ cover_url: file ? payload.image_url || payload.cover_url || form.cover_url : "" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image update failed");
    } finally {
      setUploading(false);
    }
  };

  const d = !canWrite;
  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5">
      {error ? <AdminErrorAlert message={error} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusTone(status)}>{eventStatusLabel({ status, results_published: event.results_published })}</StatusBadge>
        {!event.is_published && status !== "draft" ? <StatusBadge tone="neutral">Hidden</StatusBadge> : null}
        {canWrite ? (
          <div className="ml-auto flex flex-wrap gap-2">
            {canOpen ? (
              <button type="button" className={primaryBtn} disabled={busy} onClick={() => setVoting(true)}>
                Open voting
              </button>
            ) : null}
            {canClose ? (
              <button type="button" className={btn} disabled={busy} onClick={() => setVoting(false)}>
                Close voting
              </button>
            ) : null}
            <button type="button" className={btn} disabled={busy || uploading} onClick={togglePublish}>
              {event.is_published ? "Unpublish" : "Publish"}
            </button>
          </div>
        ) : null}
      </div>
      {!event.is_published && canWrite ? (
        <p className="text-xs text-text-secondary">
          Add categories and nominees, then publish. Voting opens on the start date, or when you press Open voting.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field label="Title">
            <input className={fieldClass} disabled={d} value={form.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </div>
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
        <div className="md:col-span-2">
          <Field label="Cover image">
            <CoverPicker
              previewUrl={form.cover_url.trim()}
              inputRef={coverInputRef}
              disabled={d}
              uploading={uploading}
              onPick={(file) => void changeCover(file)}
              onRemove={canWrite && form.cover_url.trim() ? () => void changeCover(null) : undefined}
            />
          </Field>
        </div>
        <Field label="Voting starts" hint="Leave empty to open it manually.">
          <input
            type="datetime-local"
            className={fieldClass}
            disabled={d || event.results_published}
            value={form.voting_starts_at}
            onChange={(e) => set({ voting_starts_at: e.target.value })}
          />
        </Field>
        <Field label="Voting ends" hint="Leave empty to close it manually.">
          <input
            type="datetime-local"
            className={fieldClass}
            disabled={d || event.results_published}
            value={form.voting_ends_at}
            onChange={(e) => set({ voting_ends_at: e.target.value })}
          />
        </Field>
      </div>
      <Check
        label="Show vote counts while voting is open"
        checked={form.leaderboard_public}
        disabled={d}
        onChange={(v) => set({ leaderboard_public: v })}
      />
      {canWrite ? (
        <div className="flex justify-end">
          <button type="button" className={primaryBtn} disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      ) : null}
      {event.is_published ? <AnnounceBox eventId={event.id} canWrite={canWrite} /> : null}
    </div>
  );
}

function AnnounceBox({ eventId, canWrite }: { eventId: string; canWrite: boolean }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  if (!canWrite) return null;
  return (
    <div className="space-y-3 border-t border-border pt-5">
      <h3 className="font-semibold">Message voters</h3>
      {error ? <AdminErrorAlert message={error} /> : null}
      {sent ? <p className="text-sm text-emerald-700">{sent}</p> : null}
      <input className={fieldClass} placeholder="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className={`${fieldClass} h-20 py-2`}
        placeholder="Message"
        maxLength={500}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        type="button"
        className={btn}
        disabled={busy || !title.trim() || !body.trim()}
        onClick={() =>
          run(async () => {
            const out = (await postAdmin(`${API}/events/${eventId}/announce`, { title, body })) as { recipients: number };
            setSent(`Sent to ${formatNumber(out.recipients)} voters.`);
            setTitle("");
            setBody("");
          })
        }
      >
        Send
      </button>
    </div>
  );
}

// ── Categories ──────────────────────────────────────────────────────────────

type CategoryForm = {
  name: string;
  description: string;
  free_votes_per_period: string;
  free_vote_period: string;
  paid_votes_enabled: boolean;
  is_active: boolean;
};

function categoryForm(c?: AwardCategoryRow): CategoryForm {
  return {
    name: c?.name ?? "",
    description: c?.description ?? "",
    free_votes_per_period: String(c?.free_votes_per_period ?? 1),
    free_vote_period: c?.free_vote_period ?? "daily",
    paid_votes_enabled: c?.paid_votes_enabled ?? true,
    is_active: c?.is_active ?? true,
  };
}

const PERIOD_SHORT: Record<string, string> = { daily: "day", weekly: "week", event: "event" };

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
    if (!window.confirm(`Delete “${c.name}”? A category with votes can only be turned off.`)) return;
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
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted text-left text-xs text-text-secondary">
              <tr>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Voting</th>
                <th className="px-4 py-2">Free votes</th>
                <th className="px-4 py-2">Nominees</th>
                <th className="px-4 py-2">Votes</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {detail.categories.map((c) => {
                const state = c.is_active ? votingStateLabel(c.voting_state) : { label: "Off", tone: "warning" as const };
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2">
                      <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                    </td>
                    <td className="px-4 py-2">
                      {c.free_votes_per_period > 0
                        ? `${c.free_votes_per_period} per ${PERIOD_SHORT[c.free_vote_period] ?? c.free_vote_period}`
                        : "Off"}
                    </td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
        free_votes_per_period: Number(f.free_votes_per_period) || 0,
        free_vote_period: f.free_vote_period,
        paid_votes_enabled: f.paid_votes_enabled,
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
      footer={<AdminModalFooter onCancel={onClose} onSave={save} saving={busy} disabled={!f.name.trim()} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {error ? (
          <div className="sm:col-span-2">
            <AdminErrorAlert message={error} />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <Field label="Name">
            <input className={fieldClass} value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea className={`${fieldClass} h-20 py-2`} value={f.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
        <Field label="Free votes per voter" hint="0 turns free voting off.">
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={f.free_votes_per_period}
            onChange={(e) => set({ free_votes_per_period: e.target.value })}
          />
        </Field>
        <Field label="Resets">
          <select className={fieldClass} value={f.free_vote_period} onChange={(e) => set({ free_vote_period: e.target.value })}>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="event">Never (once per event)</option>
          </select>
        </Field>
        <div className="flex flex-wrap gap-6 sm:col-span-2">
          <Check label="Allow paid votes" checked={f.paid_votes_enabled} onChange={(v) => set({ paid_votes_enabled: v })} />
          <Check label="Active" checked={f.is_active} onChange={(v) => set({ is_active: v })} />
        </div>
      </div>
    </AdminModal>
  );
}

// ── Nominees ────────────────────────────────────────────────────────────────

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
    if (!window.confirm(`Delete ${p.name}? Nominees with votes can only be withdrawn.`)) return;
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
            <Plus className="h-4 w-4" /> Add nominee
          </button>
          <button type="button" className={btn} onClick={() => setImporting(true)} disabled={!detail.categories.length}>
            <Upload className="h-4 w-4" /> Import CSV
          </button>
        </div>
      ) : null}
      {detail.participants.length === 0 ? (
        <AdminEmpty
          title="No nominees"
          description={detail.categories.length ? "Add nominees one by one or import a CSV." : "Add a category first."}
        />
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
                <p className="truncate font-medium">{p.name}</p>
                {p.organization ? <p className="truncate text-xs text-text-secondary">{p.organization}</p> : null}
                {p.user_email || p.user_username ? (
                  <p className="truncate text-xs text-text-secondary">{p.user_email || `@${p.user_username}`}</p>
                ) : null}
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
                          {NOMINATION_LABELS[s] ?? s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <StatusBadge tone={statusTone(n.status)}>{NOMINATION_LABELS[n.status] ?? n.status}</StatusBadge>
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

type PickedUser = { id: string; display_name?: string; email?: string; username?: string; avatar_url?: string };

/** Search Spojex users by email (or name / @username) and pick one. */
function UserSearch({ onPick }: { onPick: (u: PickedUser) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PickedUser[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRows([]);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await adminFetch(`/api/admin/users?limit=8&q=${encodeURIComponent(term)}`);
        const json = (await res.json().catch(() => ({}))) as { data?: PickedUser[] };
        if (live) setRows(Array.isArray(json.data) ? json.data : []);
      } finally {
        if (live) setLoading(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <div className="space-y-2">
      <input
        className={fieldClass}
        type="search"
        autoFocus
        autoComplete="off"
        placeholder="Search by email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim().length >= 2 ? (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
          {rows.length === 0 ? (
            <p className="p-3 text-xs text-text-secondary">{loading ? "Searching…" : "No Spojex user found."}</p>
          ) : (
            rows.map((u) => (
              <button
                key={u.id}
                type="button"
                className="flex w-full items-center gap-3 border-b border-border p-2 text-left last:border-0 hover:bg-muted"
                onClick={() => onPick(u)}
              >
                <UserAvatar url={u.avatar_url} name={u.display_name || u.email || "?"} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{u.display_name || u.username || u.email}</span>
                  <span className="block truncate text-xs text-text-secondary">{u.email || `@${u.username}`}</span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function UserAvatar({ url, name }: { url?: string; name: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
  ) : (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
      {name.slice(0, 1).toUpperCase()}
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
  const [user, setUser] = useState<PickedUser | null>(
    participant && (participant.user_email || participant.user_username)
      ? {
          id: participant.id,
          display_name: participant.name,
          email: participant.user_email || undefined,
          username: participant.user_username || undefined,
          avatar_url: participant.photo_url || undefined,
        }
      : null,
  );
  const [changedUser, setChangedUser] = useState(false);
  const [bio, setBio] = useState(participant?.bio ?? "");
  const [categories, setCategories] = useState(new Set<string>(existing));
  const { busy, error, run } = useAction();
  const lookup = user?.email || (user?.username ? `@${user.username}` : "");
  const canSave = Boolean(lookup) && (participant ? true : categories.size > 0);
  const save = () =>
    run(async () => {
      const body: Record<string, unknown> = {
        bio,
        // Adding a category nominates; removing is done by withdrawing the nomination.
        category_ids: [...categories].filter((id) => !existing.has(id)),
      };
      // Name and photo are refreshed from the Spojex account.
      if (!participant || changedUser) body.email = lookup;
      if (participant) await patchAdmin(`${API}/participants/${participant.id}`, body);
      else await postAdmin(`${API}/events/${detail.event.id}/participants`, body);
      onSaved();
    });
  return (
    <AdminModal
      open
      title={participant ? "Edit nominee" : "Add nominee"}
      onClose={onClose}
      className="max-w-xl"
      footer={<AdminModalFooter onCancel={onClose} onSave={save} saving={busy} disabled={!canSave} />}
    >
      <div className="space-y-4">
        {error ? <AdminErrorAlert message={error} /> : null}
        <div>
          <p className={labelClass}>Spojex user</p>
          {user ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-2">
              <UserAvatar url={user.avatar_url} name={user.display_name || lookup} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{user.display_name || user.username || user.email}</span>
                <span className="block truncate text-xs text-text-secondary">{lookup}</span>
              </span>
              <button type="button" className={btn} onClick={() => setUser(null)}>
                Change
              </button>
            </div>
          ) : (
            <UserSearch
              onPick={(u) => {
                setUser(u);
                setChangedUser(true);
              }}
            />
          )}
          <p className="mt-1 text-xs text-text-secondary">Name and photo come from their Spojex profile.</p>
        </div>
        <Field label="Short bio">
          <textarea
            className={`${fieldClass} h-20 py-2`}
            maxLength={300}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </Field>
        <div>
          <p className={labelClass}>Categories</p>
          <div className="flex flex-wrap gap-3">
            {detail.categories.map((c) => (
              <Check
                key={c.id}
                label={c.name}
                checked={categories.has(c.id)}
                disabled={existing.has(c.id)}
                onChange={(v) => {
                  const next = new Set(categories);
                  if (v) next.add(c.id);
                  else next.delete(c.id);
                  setCategories(next);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </AdminModal>
  );
}

function BulkImportModal({ eventId, onClose, onDone }: { eventId: string; onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState("email,categories,bio\n");
  const { busy, error, run } = useAction();
  const save = () =>
    run(async () => {
      await postAdmin(`${API}/events/${eventId}/participants/bulk`, { csv });
      onDone();
    });
  return (
    <AdminModal
      open
      title="Import nominees"
      onClose={onClose}
      className="max-w-2xl"
      footer={<AdminModalFooter onCancel={onClose} onSave={save} saving={busy} saveLabel="Import" />}
    >
      <div className="space-y-3">
        {error ? <AdminErrorAlert message={error} /> : null}
        <p className="text-xs text-text-secondary">
          One nominee per row, by Spojex email. Name and photo come from their profile. Separate several
          categories with <code>|</code>.
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

// ── Vote packages ───────────────────────────────────────────────────────────

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
        await postAdmin(`${API}/events/${detail.event.id}/packages`, { ...p, sort_order: i });
      }
      onChanged();
    });
  const catName = (id: string | null) => (id ? detail.categories.find((c) => c.id === id)?.name : null);
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
              Add 4 standard packages
            </button>
          ) : null}
        </div>
      ) : null}
      {detail.packages.length === 0 ? (
        <AdminEmpty title="No vote packages" description="Without packages, people can only use free votes." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted text-left text-xs text-text-secondary">
              <tr>
                <th className="px-4 py-2">Package</th>
                <th className="px-4 py-2">Votes</th>
                <th className="px-4 py-2">Price (ETB)</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {detail.packages.map((p) => (
                <tr key={p.id} className={cn("border-t border-border", !p.is_active && "text-text-secondary")}>
                  <td className="px-4 py-2 font-medium">
                    {p.name}
                    {catName(p.category_id) ? (
                      <span className="ml-2 text-xs text-text-secondary">only {catName(p.category_id)}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">{formatNumber(p.votes)}</td>
                  <td className="px-4 py-2">{Number(p.price_etb) > 0 ? Number(p.price_etb).toFixed(2) : "Free"}</td>
                  <td className="px-4 py-2 text-right">
                    {canWrite ? (
                      <div className="flex justify-end gap-1">
                        <button type="button" className={btn} onClick={() => toggle(p)}>
                          {p.is_active ? "Turn off" : "Turn on"}
                        </button>
                        <button type="button" className={btn} onClick={() => setEditing(p)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    ) : !p.is_active ? (
                      "Off"
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? (
        <PackageModal
          eventId={detail.event.id}
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
  eventId,
  pkg,
  onClose,
  onSaved,
}: {
  eventId: string;
  pkg?: AwardPackageRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: pkg?.name ?? "",
    votes: String(pkg?.votes ?? 10),
    price_etb: String(pkg?.price_etb ?? 20),
  });
  const { busy, error, run } = useAction();
  const save = () =>
    run(async () => {
      const body = { name: f.name, votes: Number(f.votes), price_etb: Number(f.price_etb) };
      if (pkg) await patchAdmin(`${API}/packages/${pkg.id}`, body);
      else await postAdmin(`${API}/events/${eventId}/packages`, body);
      onSaved();
    });
  return (
    <AdminModal
      open
      title={pkg ? "Edit package" : "New vote package"}
      onClose={onClose}
      footer={<AdminModalFooter onCancel={onClose} onSave={save} saving={busy} disabled={!f.name.trim()} />}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {error ? (
          <div className="sm:col-span-3">
            <AdminErrorAlert message={error} />
          </div>
        ) : null}
        <Field label="Name">
          <input className={fieldClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Votes">
          <input type="number" min={1} className={fieldClass} value={f.votes} onChange={(e) => setF({ ...f, votes: e.target.value })} />
        </Field>
        <Field label="Price (ETB)" hint="0 = free">
          <input
            type="number"
            min={0}
            step="0.01"
            className={fieldClass}
            value={f.price_etb}
            onChange={(e) => setF({ ...f, price_etb: e.target.value })}
          />
        </Field>
      </div>
    </AdminModal>
  );
}

// ── Votes (live counts) ─────────────────────────────────────────────────────

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
      if (!res.ok) setError(payload.error || "Could not load votes");
      else setRows(payload.data?.rows ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);
  if (!detail.categories.length) {
    return <AdminEmpty title="No categories" description="Votes appear here once categories have nominees." />;
  }
  const total = (rows ?? []).reduce((sum, r) => sum + Number(r.total_votes || 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select className={cn(fieldClass, "sm:w-72")} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {detail.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {rows ? <span className="text-sm text-text-secondary">{formatNumber(total)} votes</span> : null}
      </div>
      {error ? <AdminErrorAlert message={error} /> : null}
      {!rows && !error ? <AdminLoadingRow label="Loading votes…" /> : null}
      {rows && rows.length === 0 ? <AdminEmpty title="No nominees" description="Add nominees to this category." /> : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-muted text-left text-xs text-text-secondary">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Nominee</th>
                <th className="px-4 py-2">Votes</th>
                <th className="px-4 py-2">Free / paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.nomination_id} className="border-t border-border">
                  <td className="px-4 py-2 font-semibold">{r.rank}</td>
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2 font-medium">{formatNumber(r.total_votes)}</td>
                  <td className="px-4 py-2 text-xs text-text-secondary">
                    {formatNumber(r.free_votes)} / {formatNumber(r.paid_votes)}
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

// ── Winners ─────────────────────────────────────────────────────────────────

type ComputeSummary = { computed: number; skipped_open: number; frozen: number };

export function ResultsPanel({ detail, canResults }: { detail: AwardEventDetail; canResults: boolean }) {
  const [data, setData] = useState<{ results: AwardResultGroup[]; integrity: AwardIntegrity[] } | null>(null);
  const [winners, setWinners] = useState("1");
  const [notice, setNotice] = useState<string | null>(null);
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
      setNotice(null);
      const out = (await postAdmin(`${API}/events/${eventId}/results/${path}`, body)) as Partial<ComputeSummary>;
      if (path === "compute") {
        const parts = [`Counted ${out.computed ?? 0} ${out.computed === 1 ? "category" : "categories"}.`];
        if (out.skipped_open) parts.push(`${out.skipped_open} still open — close voting first.`);
        if (out.frozen) parts.push(`${out.frozen} already approved.`);
        setNotice(parts.join(" "));
      }
      await load();
    });

  const groups = data?.results ?? [];
  const mismatch = new Set((data?.integrity ?? []).filter((i) => !i.matches).map((i) => i.category_id));
  const anyComputed = groups.some((g) => g.status === "computed");
  const anyApproved = groups.some((g) => g.status === "approved");
  return (
    <div className="space-y-4">
      {error ? <AdminErrorAlert message={error} /> : null}
      {canResults && !detail.event.results_published ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
          <Field label="Winners per category">
            <input
              type="number"
              min={1}
              max={10}
              className={cn(fieldClass, "w-28")}
              value={winners}
              onChange={(e) => setWinners(e.target.value)}
            />
          </Field>
          <button type="button" className={btn} disabled={busy} onClick={() => act("compute", { winners: Number(winners) || 1 })}>
            1. Count votes
          </button>
          <button type="button" className={btn} disabled={busy || !anyComputed} onClick={() => act("approve")}>
            2. Approve
          </button>
          <button
            type="button"
            className={primaryBtn}
            disabled={busy || !anyApproved}
            onClick={() => {
              if (window.confirm("Publish winners? Everyone who voted is notified.")) void act("publish");
            }}
          >
            3. Publish winners
          </button>
        </div>
      ) : null}
      {notice ? <p className="text-sm text-text-secondary">{notice}</p> : null}
      {!data ? <AdminLoadingRow label="Loading results…" /> : null}
      {data && groups.length === 0 ? (
        <AdminEmpty title="No results yet" description="Close voting, then count the votes." />
      ) : null}
      {groups.map((g) => (
        <div key={g.category_id} className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <h3 className="font-semibold">{g.category_name}</h3>
            <StatusBadge tone={statusTone(g.status)}>{RESULT_STATUS_LABELS[g.status] ?? g.status}</StatusBadge>
            {mismatch.has(g.category_id) ? (
              <StatusBadge tone="danger">
                <ShieldAlert className="mr-1 inline h-3 w-3" />
                Votes changed since counting — count again
              </StatusBadge>
            ) : null}
          </div>
          <table className="w-full text-sm">
            <tbody>
              {g.rows.map((r) => (
                <ResultRow key={r.id} row={r} canEdit={canResults && g.status !== "published"} onSaved={load} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
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
  const { busy, run } = useAction();
  const dirty = prize !== (row.prize ?? "");
  return (
    <tr className="border-t border-border">
      <td className="w-12 px-4 py-2 font-semibold">{row.rank}</td>
      <td className="px-4 py-2">
        {row.participant_name} {row.is_winner ? <span title="Winner">🏆</span> : null}
      </td>
      <td className="px-4 py-2">{formatNumber(row.total_votes)} votes</td>
      <td className="px-4 py-2 text-right">
        {row.is_winner && canEdit ? (
          <div className="flex justify-end gap-2">
            <input className={cn(fieldClass, "h-8 w-44")} placeholder="Prize (optional)" value={prize} onChange={(e) => setPrize(e.target.value)} />
            {dirty ? (
              <button
                type="button"
                className={btn}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await patchAdmin(`${API}/results/${row.id}`, { prize });
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
