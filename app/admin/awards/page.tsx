"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, Plus, Trophy } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminReloadButton,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { adminCacheKey } from "@/lib/admin-session-cache";
import {
  formatNumber,
  formatWhen,
  fromLocalInput,
  statusTone,
  type AwardEventRow,
} from "@/lib/awards";
import { adminFetch, postAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60";
const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

async function loadEvents(): Promise<AwardEventRow[]> {
  const res = await adminFetch("/api/admin/awards/events");
  const payload = (await res.json().catch(() => ({}))) as {
    data?: { events: AwardEventRow[] };
    error?: string;
  };
  if (!res.ok) throw new Error(payload.error || "Could not load award events");
  return payload.data?.events ?? [];
}

export default function AwardsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("awards:write");
  const { data, loading, refreshing, error, refresh } = useAdminQuery<AwardEventRow[]>({
    key: adminCacheKey(["awards", "events"]),
    fetcher: loadEvents,
  });
  const [creating, setCreating] = useState(false);
  const events = data ?? [];

  return (
    <div>
      <AdminPageHeader
        title="Awards & Voting"
        description="Award events, categories, nominees, vote packages and winners. Votes are counted on the server only."
        actions={
          <>
            <Link
              href="/admin/awards/analytics"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
            >
              <BarChart3 className="h-4 w-4" /> Analytics
            </Link>
            <AdminReloadButton onClick={refresh} refreshing={refreshing} />
            {canWrite ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                <Plus className="h-4 w-4" /> New event
              </button>
            ) : null}
          </>
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {loading && !data ? <AdminLoadingRow label="Loading award events…" /> : null}
      {!loading && events.length === 0 && !error ? (
        <AdminEmpty title="No award events yet" description="Create an event, add categories and nominees, then publish it." />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/admin/awards/${e.id}`}
            className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:border-primary"
          >
            <div className="relative h-28 bg-muted">
              {e.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.cover_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-text-secondary">
                  <Trophy className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={statusTone(e.status)}>{e.status}</StatusBadge>
                <StatusBadge tone={e.is_published ? "success" : "neutral"}>
                  {e.is_published ? "Published" : "Unpublished"}
                </StatusBadge>
                {e.is_featured ? <StatusBadge tone="info">Featured</StatusBadge> : null}
              </div>
              <h3 className="truncate font-heading text-base font-semibold text-text-primary group-hover:text-primary">
                {e.title}
              </h3>
              <p className="text-xs text-text-secondary">
                Voting {formatWhen(e.voting_starts_at)} → {formatWhen(e.voting_ends_at)}
              </p>
              <p className="text-xs text-text-secondary">
                {formatNumber(e.category_count)} categories · {formatNumber(e.participant_count)} participants ·{" "}
                {formatNumber(e.total_votes)} votes
              </p>
            </div>
          </Link>
        ))}
      </div>
      <CreateEventModal open={creating} onClose={() => setCreating(false)} onCreated={refresh} />
    </div>
  );
}

function CreateEventModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [votingStart, setVotingStart] = useState("");
  const [votingEnd, setVotingEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const row = (await postAdmin("/api/admin/awards/events", {
        title,
        description,
        voting_starts_at: fromLocalInput(votingStart),
        voting_ends_at: fromLocalInput(votingEnd),
        status: "draft",
      })) as AwardEventRow;
      onCreated();
      onClose();
      setTitle("");
      setDescription("");
      if (row?.id) router.push(`/admin/awards/${row.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal
      open={open}
      title="New award event"
      onClose={onClose}
      footer={
        <AdminModalFooter onCancel={onClose} onSave={save} saving={saving} disabled={!title.trim()} saveLabel="Create" />
      }
    >
      <div className="space-y-4">
        {error ? <AdminErrorAlert message={error} /> : null}
        <div>
          <label className={labelClass}>Title</label>
          <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <textarea
            className={`${fieldClass} h-24 py-2`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Voting starts</label>
            <input type="datetime-local" className={fieldClass} value={votingStart} onChange={(e) => setVotingStart(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Voting ends</label>
            <input type="datetime-local" className={fieldClass} value={votingEnd} onChange={(e) => setVotingEnd(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-text-secondary">The event starts as a draft. Add categories, nominees and packages, then publish.</p>
      </div>
    </AdminModal>
  );
}
