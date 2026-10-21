"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { eventDateInput, formatEventWhen } from "@/lib/events";
import { adminFetch, patchAdmin, postAdminResponse } from "@/lib/hooks";
import {
  canManageLiveEvents,
  canWriteLiveEvents,
  liveEventKinds,
  liveEventStatuses,
  liveKindLabel,
  liveStatusLabel,
  mockLiveStreams,
} from "@/lib/live-events";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { LiveEventRow } from "@/lib/types";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

/** Live video / events list used by the Streams hub Video tab. */
export default function LiveEventsPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = canWriteLiveEvents(can);
  const [rows, setRows] = useState<LiveEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    kind: "football",
    name: "",
    starts_at: "",
    stream_url: "",
    stream_kind: "video",
    thumbnail_url: "",
    home_name: "",
    away_name: "",
    fighter_a: "",
    fighter_b: "",
  });

  const load = async () => {
    const response = await adminFetch("/api/admin/live-events");
    const payload = (await response.json()) as { data?: LiveEventRow[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Failed to load");
    setRows(payload.data ?? []);
  };

  useEffect(() => {
    if (!canManageLiveEvents(can) && !loading) return;
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "video");
    if (status !== "all") next.set("status", status);
    else next.delete("status");
    router.replace(`/admin/streams?${next.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind !== "all" && row.kind !== kind) return false;
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return [row.name, row.home_name, row.away_name, row.fighter_a, row.fighter_b, row.location, row.competition]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [kind, query, rows, status]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setCreating(true);
    setError(null);
    try {
      const payload = await postAdminResponse("/api/admin/live-events", {
        ...form,
        starts_at: form.starts_at || eventDateInput(new Date().toISOString()),
      });
      const created = payload.data as LiveEventRow | undefined;
      setCreateOpen(false);
      if (created?.id) router.push(`/admin/live-events/${created.id}`);
      else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const openDetail = (eventId: string, hash?: string) => {
    router.push(`/admin/live-events/${eventId}${hash ?? ""}`);
  };

  const setStatusQuick = async (eventId: string, nextStatus: string, goBoard = false) => {
    if (!canWrite) return;
    setError(null);
    try {
      await patchAdmin(`/api/admin/live-events/${eventId}`, {
        status: nextStatus,
        ...(nextStatus === "live" ? { ends_at: null } : {}),
      });
      await load();
      if (goBoard) openDetail(eventId, "#live-board");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <>
      {canWrite ? (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            New live event
          </button>
        </div>
      ) : null}
      <AdminFilterPanel>
        <AdminSearchInput value={query} onChange={setQuery} placeholder="Search events" />
        <AdminSelect value={kind} onChange={setKind}>
          <option value="all">All kinds</option>
          {liveEventKinds.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </AdminSelect>
        <AdminSelect value={status} onChange={setStatus}>
          <option value="all">All statuses</option>
          {liveEventStatuses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </AdminSelect>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading live events…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title="No live events"
            description="Create a stream, match, fight, or show. The app shows countdown until start, then live score, audio, or video."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Event</th>
                  <th className="px-4 py-3 font-semibold">Kind</th>
                  <th className="px-4 py-3 font-semibold">Starts</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Stream</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => openDetail(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDetail(row.id);
                      }
                    }}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {row.thumbnail_url?.trim() ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.thumbnail_url}
                            alt=""
                            className="h-11 w-16 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-text-secondary">
                            No image
                          </div>
                        )}
                        <span className="font-medium">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{liveKindLabel(row.kind)}</td>
                    <td className="px-4 py-3 text-text-secondary">{formatEventWhen(row.starts_at)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone(row.status)}>{liveStatusLabel(row.status)}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.stream_url ? "Yes" : "Score only"}
                    </td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-wrap gap-3">
                        {canWrite &&
                        row.status !== "live" &&
                        row.status !== "suspended" &&
                        row.status !== "finished" &&
                        row.status !== "cancelled" ? (
                          <button
                            type="button"
                            className="text-sm font-medium text-red-600 hover:underline"
                            onClick={() => void setStatusQuick(row.id, "live", true)}
                          >
                            Go live
                          </button>
                        ) : null}
                        {canWrite && row.status === "live" ? (
                          <button
                            type="button"
                            className="text-sm font-medium text-amber-700 hover:underline"
                            onClick={() => void setStatusQuick(row.id, "suspended")}
                          >
                            Pause
                          </button>
                        ) : null}
                        {canWrite && row.status === "suspended" ? (
                          <button
                            type="button"
                            className="text-sm font-medium text-emerald-700 hover:underline"
                            onClick={() => void setStatusQuick(row.id, "live", true)}
                          >
                            Resume
                          </button>
                        ) : null}
                        <Link
                          href={`/admin/live-events/${row.id}#live-board`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>

      <AdminModal
        open={createOpen}
        title="New live event"
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={create} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Kind</span>
            <select
              className={fieldClass}
              value={form.kind}
              onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value }))}
            >
              {liveEventKinds.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Name</span>
            <input
              className={fieldClass}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Start</span>
            <input
              type="datetime-local"
              className={fieldClass}
              value={form.starts_at || eventDateInput(new Date().toISOString())}
              onChange={(event) => setForm((current) => ({ ...current, starts_at: event.target.value }))}
              required
            />
          </label>
          {form.kind === "football" || form.kind === "basketball" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={fieldClass}
                placeholder="Home team"
                value={form.home_name}
                onChange={(event) => setForm((current) => ({ ...current, home_name: event.target.value }))}
              />
              <input
                className={fieldClass}
                placeholder="Away team"
                value={form.away_name}
                onChange={(event) => setForm((current) => ({ ...current, away_name: event.target.value }))}
              />
            </div>
          ) : null}
          {form.kind === "fight" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={fieldClass}
                placeholder="Fighter A"
                value={form.fighter_a}
                onChange={(event) => setForm((current) => ({ ...current, fighter_a: event.target.value }))}
              />
              <input
                className={fieldClass}
                placeholder="Fighter B"
                value={form.fighter_b}
                onChange={(event) => setForm((current) => ({ ...current, fighter_b: event.target.value }))}
              />
            </div>
          ) : null}
          <p className="text-xs text-text-secondary">
            Upload a thumbnail on the event page after creating.
          </p>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Live stream URL (optional)</span>
            <input
              className={fieldClass}
              value={form.stream_url}
              onChange={(event) => setForm((current) => ({ ...current, stream_url: event.target.value }))}
              placeholder="Leave empty to show score only"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {mockLiveStreams.map((mock) => (
                <button
                  key={mock.id}
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      stream_url: mock.url,
                      stream_kind: mock.stream_kind,
                    }))
                  }
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs"
                >
                  {mock.label}
                </button>
              ))}
            </div>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}
