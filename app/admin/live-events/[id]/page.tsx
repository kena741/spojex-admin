"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { eventDateInput, formatEventWhen } from "@/lib/events";
import { adminFetch, deleteAdmin, patchAdmin } from "@/lib/hooks";
import {
  canWriteLiveEvents,
  formatRoundClock,
  isFightKind,
  isScoreKind,
  liveEventAppRoute,
  liveEventKinds,
  liveEventStatuses,
  liveKindLabel,
  liveStatusLabel,
  liveStreamKinds,
  matchPeriods,
  mockLiveStreams,
  parseRoundClock,
} from "@/lib/live-events";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { LiveEventRow, OrganizationRow } from "@/lib/types";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

export default function LiveEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = canWriteLiveEvents(can);
  const canNotify = can("notifications:write");
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const [row, setRow] = useState<LiveEventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [clock, setClock] = useState("03:00");

  const load = async () => {
    const { data, error: loadError } = await getSpojexClient()
      .from("live_events")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (loadError) throw loadError;
    const next = data as LiveEventRow | null;
    setRow(next);
    if (next) setClock(formatRoundClock(next.round_seconds_left));
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const scrollToLiveBoard = () => {
    window.requestAnimationFrame(() => {
      document.getElementById("live-board")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const save = async (patch: Record<string, unknown>, silent = false) => {
    setError(null);
    if (!silent) setNotice(null);
    try {
      await patchAdmin(`/api/admin/live-events/${id}`, patch);
      await load();
      if (!silent) setNotice("Saved.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    }
  };

  const goLive = async () => {
    const ok = await save({ status: "live", ends_at: null });
    if (ok) scrollToLiveBoard();
  };

  useEffect(() => {
    if (loading || !row) return;
    if (typeof window === "undefined") return;
    if (window.location.hash === "#live-board") scrollToLiveBoard();
  }, [loading, row]);

  const remove = async () => {
    if (!window.confirm(`Delete “${row?.name}”? This cannot be undone.`)) return;
    try {
      await deleteAdmin(`/api/admin/live-events/${id}`);
      router.replace("/admin/streams?tab=video");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const notifyAudience = async () => {
    if (!row || !canNotify) return;
    const live = row.status === "live";
    const title = live ? `${row.name} is LIVE` : `${row.name} starts soon`;
    const body = live
      ? "Open Spojex to watch and follow the live event."
      : `Starts ${formatEventWhen(row.starts_at)}.`;
    if (!window.confirm(`Send “${title}” to users with notifications enabled?`)) return;
    setNotifying(true);
    setError(null);
    setNotice(null);
    try {
      const response = await adminFetch("/api/admin/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          route: liveEventAppRoute(id),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        sent?: number;
        skipped?: number;
        failed?: number;
      };
      if (!response.ok) throw new Error(payload.error || "Notify failed");
      setNotice(
        `Notification sent to ${payload.sent ?? 0} devices` +
          (payload.skipped ? ` · ${payload.skipped} skipped` : "") +
          (payload.failed ? ` · ${payload.failed} failed` : "") +
          ".",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notify failed");
    } finally {
      setNotifying(false);
    }
  };

  const uploadThumbnail = async (file: File) => {
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await adminFetch(`/api/admin/live-events/${id}/image`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      await load();
      setNotice("Thumbnail updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (thumbInputRef.current) thumbInputRef.current.value = "";
    }
  };

  if (loading) return <AdminLoadingRow label="Loading live event…" />;
  if (!row) return <AdminErrorAlert message={error || "Event not found"} />;

  const scoreKind = isScoreKind(row.kind);
  const fightKind = isFightKind(row.kind);

  return (
    <>
      <AdminPageHeader
        title={row.name}
        description={`${liveKindLabel(row.kind)} · ${formatEventWhen(row.starts_at)}`}
        backHref="/admin/streams?tab=video"
        breadcrumbs={[
          { label: "Streams", href: "/admin/streams?tab=video" },
          { label: row.name },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            {canWrite &&
            row.status !== "live" &&
            row.status !== "suspended" &&
            row.status !== "finished" &&
            row.status !== "cancelled" ? (
              <button
                type="button"
                onClick={() => void goLive()}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white"
              >
                Go live
              </button>
            ) : null}
            {canWrite && row.status === "live" ? (
              <button
                type="button"
                onClick={() => void save({ status: "suspended" })}
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
              >
                Pause live
              </button>
            ) : null}
            {canWrite && row.status === "suspended" ? (
              <button
                type="button"
                onClick={() => void goLive()}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
              >
                Resume live
              </button>
            ) : null}
            {canWrite && row.status === "live" ? (
              <button
                type="button"
                onClick={() => void save({ status: "finished" })}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium"
              >
                End event
              </button>
            ) : null}
            {canWrite && row.status !== "postponed" && row.status !== "finished" && row.status !== "cancelled" ? (
              <button
                type="button"
                onClick={() => void save({ status: "postponed" })}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium"
              >
                Postpone
              </button>
            ) : null}
            {canWrite && row.status === "postponed" ? (
              <button
                type="button"
                onClick={() => void save({ status: "scheduled", ends_at: null })}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium"
              >
                Back to scheduled
              </button>
            ) : null}
            {canNotify ? (
              <button
                type="button"
                disabled={notifying}
                onClick={() => void notifyAudience()}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {notifying ? "Notifying…" : "Notify audience"}
              </button>
            ) : null}
            {canWrite ? (
              <button
                type="button"
                onClick={() => void remove()}
                className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700"
              >
                Delete
              </button>
            ) : null}
          </div>
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-heading text-sm font-semibold">Overview</h3>
            <StatusBadge tone={requestTone(row.status)}>{liveStatusLabel(row.status)}</StatusBadge>
          </div>
          <div className="grid gap-3">
            <Field
              label="Name"
              value={row.name}
              disabled={!canWrite}
              onSave={(value) => save({ name: value })}
            />
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Kind</span>
              <select
                className={fieldClass}
                disabled={!canWrite}
                value={row.kind}
                onChange={(event) => {
                  const kind = event.target.value;
                  void save({
                    kind,
                    ...(kind === "radio" ? { stream_kind: "audio" } : {}),
                  });
                }}
              >
                {liveEventKinds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Status</span>
              <select
                className={fieldClass}
                disabled={!canWrite}
                value={row.status}
                onChange={(event) => void save({ status: event.target.value })}
              >
                {liveEventStatuses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Start</span>
              <input
                type="datetime-local"
                className={fieldClass}
                disabled={!canWrite}
                defaultValue={eventDateInput(row.starts_at)}
                onBlur={(event) => {
                  if (event.target.value) void save({ starts_at: event.target.value });
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">End (optional)</span>
              <input
                type="datetime-local"
                className={fieldClass}
                disabled={!canWrite}
                defaultValue={eventDateInput(row.ends_at)}
                onBlur={(event) => void save({ ends_at: event.target.value || null })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">
                Auto-finish after start (minutes, if no end time)
              </span>
              <input
                type="number"
                min={5}
                max={1440}
                className={fieldClass}
                disabled={!canWrite}
                defaultValue={row.default_duration_minutes ?? 120}
                onBlur={(event) => {
                  const value = Number(event.target.value || 120);
                  if (value !== (row.default_duration_minutes ?? 120)) {
                    void save({ default_duration_minutes: value });
                  }
                }}
              />
            </label>
            <Field
              label="Location"
              value={row.location ?? ""}
              disabled={!canWrite}
              onSave={(value) => save({ location: value })}
            />
            <Field
              label="Stadium"
              value={row.stadium ?? ""}
              disabled={!canWrite}
              onSave={(value) => save({ stadium: value })}
            />
            <Field
              label="Organizer"
              value={row.organizer ?? ""}
              disabled={!canWrite}
              onSave={(value) => save({ organizer: value })}
            />
            <HostOrgPicker
              value={row.host_org_id ?? ""}
              hostUserId={row.host_user_id ?? ""}
              disabled={!canWrite}
              onChange={(orgId) =>
                void save({
                  host_org_id: orgId || null,
                  ...(orgId ? {} : { host_user_id: null }),
                })
              }
            />
            {!row.host_org_id && !row.host_user_id ? (
              <p className="text-sm text-amber-700">
                Link Spojex (or another org) so viewers can follow and gift coins during this live.
              </p>
            ) : null}
            <Field
              label="Competition / tournament"
              value={row.competition ?? ""}
              disabled={!canWrite}
              onSave={(value) => save({ competition: value })}
            />
            <div className="grid gap-2">
              <span className="text-sm text-text-secondary">Thumbnail</span>
              {row.thumbnail_url?.trim() ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={row.thumbnail_url}
                    alt=""
                    className="h-40 w-full rounded-xl object-cover"
                  />
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => void save({ thumbnail_url: "" })}
                      className="absolute right-3 top-3 rounded-md bg-black/70 px-2.5 py-1.5 text-xs font-medium text-white"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-sm text-text-secondary">
                  No thumbnail yet
                </div>
              )}
              {canWrite ? (
                <div>
                  <input
                    ref={thumbInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={uploading}
                    onChange={(changeEvent) => {
                      const file = changeEvent.target.files?.[0];
                      if (file) void uploadThumbnail(file);
                    }}
                    className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                  />
                  <p className="mt-1 text-xs text-text-secondary">
                    JPG, PNG, WebP, or GIF · max 5 MB
                  </p>
                  {uploading ? (
                    <p className="mt-1 text-xs text-text-secondary">Uploading thumbnail…</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Stream type</span>
              <select
                className={fieldClass}
                disabled={!canWrite}
                value={row.stream_kind || (row.kind === "radio" ? "audio" : "video")}
                onChange={(event) => void save({ stream_kind: event.target.value })}
              >
                {liveStreamKinds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Live stream / audio URL"
              value={row.stream_url}
              disabled={!canWrite}
              onSave={(value) => save({ stream_url: value })}
            />
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                {mockLiveStreams.map((mock) => (
                  <button
                    key={mock.id}
                    type="button"
                    onClick={() =>
                      void save({
                        stream_url: mock.url,
                        stream_kind: mock.stream_kind,
                      })
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    {mock.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    void save({
                      stream_url: mockLiveStreams[0].url,
                      stream_kind: "video",
                      status: "live",
                      ends_at: null,
                    })
                  }
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white"
                >
                  Mock stream & go live
                </button>
                {row.stream_url ? (
                  <button
                    type="button"
                    onClick={() => void save({ stream_url: "" })}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    Remove stream
                  </button>
                ) : null}
              </div>
            ) : null}
            <p className="text-xs text-text-secondary">
              Mock files are public samples so the app can play without a real encoder. Paste an HLS
              or MP4 URL later for production. Re-click Mock if an older sample URL stopped working.
            </p>
            {row.stream_url ? (
              <div className="overflow-hidden rounded-xl bg-black">
                {row.stream_kind === "audio" || row.kind === "radio" ? (
                  <audio
                    key={row.stream_url}
                    className="w-full"
                    controls
                    src={row.stream_url}
                    onError={() =>
                      setError("Stream preview failed to load. Re-apply a mock stream or check the URL.")
                    }
                  />
                ) : (
                  <video
                    key={row.stream_url}
                    className="aspect-video w-full"
                    controls
                    playsInline
                    src={row.stream_url}
                    onError={() =>
                      setError("Stream preview failed to load. Re-apply a mock stream or check the URL.")
                    }
                  />
                )}
              </div>
            ) : null}
            <Field
              label="Replay / recording URL"
              value={row.replay_url ?? ""}
              disabled={!canWrite}
              onSave={(value) => save({ replay_url: value })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={row.chat_enabled !== false}
                disabled={!canWrite}
                onChange={(event) => void save({ chat_enabled: event.target.checked })}
              />
              <span>Live chat enabled</span>
            </label>
            <Field
              label="Description"
              value={row.description}
              disabled={!canWrite}
              multiline
              onSave={(value) => save({ description: value })}
            />
          </div>
        </section>

        <section id="live-board" className="scroll-mt-24 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-4 font-heading text-sm font-semibold">Live board</h3>
          {scoreKind ? (
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Home"
                  value={row.home_name}
                  disabled={!canWrite}
                  onSave={(value) => save({ home_name: value })}
                />
                <Field
                  label="Away"
                  value={row.away_name}
                  disabled={!canWrite}
                  onSave={(value) => save({ away_name: value })}
                />
              </div>
              <Field
                label="Home logo URL"
                value={row.home_logo_url ?? ""}
                disabled={!canWrite}
                onSave={(value) => save({ home_logo_url: value })}
              />
              <Field
                label="Away logo URL"
                value={row.away_logo_url ?? ""}
                disabled={!canWrite}
                onSave={(value) => save({ away_logo_url: value })}
              />
              <ScoreStepper
                label={row.home_name || "Home"}
                value={row.home_score}
                disabled={!canWrite}
                onChange={(value) => save({ home_score: value }, true)}
              />
              <ScoreStepper
                label={row.away_name || "Away"}
                value={row.away_score}
                disabled={!canWrite}
                onChange={(value) => save({ away_score: value }, true)}
              />
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Match minute</span>
                <input
                  type="number"
                  min={0}
                  className={fieldClass}
                  disabled={!canWrite}
                  defaultValue={row.match_minute}
                  onBlur={(event) => void save({ match_minute: Number(event.target.value || 0) })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Match status</span>
                <select
                  className={fieldClass}
                  disabled={!canWrite}
                  value={row.match_period}
                  onChange={(event) => void save({ match_period: event.target.value })}
                >
                  {matchPeriods.map((item) => (
                    <option key={item || "none"} value={item}>
                      {item || "—"}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Status line (who scored / ticker)"
                value={row.status_line ?? ""}
                disabled={!canWrite}
                onSave={(value) => save({ status_line: value }, true)}
              />
            </div>
          ) : null}

          {fightKind ? (
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Fighter A"
                  value={row.fighter_a}
                  disabled={!canWrite}
                  onSave={(value) => save({ fighter_a: value })}
                />
                <Field
                  label="Fighter B"
                  value={row.fighter_b}
                  disabled={!canWrite}
                  onSave={(value) => save({ fighter_b: value })}
                />
              </div>
              <Field
                label="Fighter A photo URL"
                value={row.fighter_a_photo_url ?? ""}
                disabled={!canWrite}
                onSave={(value) => save({ fighter_a_photo_url: value })}
              />
              <Field
                label="Fighter B photo URL"
                value={row.fighter_b_photo_url ?? ""}
                disabled={!canWrite}
                onSave={(value) => save({ fighter_b_photo_url: value })}
              />
              <Field
                label="Weight / category"
                value={row.weight_class ?? ""}
                disabled={!canWrite}
                onSave={(value) => save({ weight_class: value })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Current round</span>
                  <input
                    type="number"
                    min={1}
                    className={fieldClass}
                    disabled={!canWrite}
                    defaultValue={row.current_round}
                    onBlur={(event) => void save({ current_round: Number(event.target.value || 1) })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Total rounds</span>
                  <input
                    type="number"
                    min={1}
                    className={fieldClass}
                    disabled={!canWrite}
                    defaultValue={row.total_rounds}
                    onBlur={(event) => void save({ total_rounds: Number(event.target.value || 5) })}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Round timer (mm:ss)</span>
                <div className="flex gap-2">
                  <input
                    className={fieldClass}
                    disabled={!canWrite}
                    value={clock}
                    onChange={(event) => setClock(event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() => void save({ round_seconds_left: parseRoundClock(clock) }, true)}
                    className="rounded-md border border-border px-3 text-sm font-medium"
                  >
                    Set
                  </button>
                </div>
              </label>
              <Field
                label="Winner / result"
                value={row.fight_result}
                disabled={!canWrite}
                onSave={(value) => save({ fight_result: value })}
              />
              <Field
                label="Status line (short fight update)"
                value={row.status_line ?? ""}
                disabled={!canWrite}
                onSave={(value) => save({ status_line: value }, true)}
              />
            </div>
          ) : null}

          {!scoreKind && !fightKind ? (
            <p className="text-sm text-text-secondary">
              Use Go live / Pause live / Resume live / End event. If there is no stream URL, the app still shows countdown,
              status, and chat.
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onSave,
  disabled,
  multiline,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const className = multiline
    ? "min-h-24 w-full rounded-lg border border-border px-3 py-2 text-sm"
    : fieldClass;
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-text-secondary">{label}</span>
      {multiline ? (
        <textarea
          className={className}
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== value) onSave(draft);
          }}
        />
      ) : (
        <input
          className={className}
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== value) onSave(draft);
          }}
        />
      )}
    </label>
  );
}

function ScoreStepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="size-8 rounded-md border border-border text-lg leading-none disabled:opacity-40"
        >
          −
        </button>
        <span className="w-8 text-center text-lg font-semibold">{value}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          className="size-8 rounded-md border border-border text-lg leading-none disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function HostOrgPicker({
  value,
  hostUserId,
  disabled,
  onChange,
}: {
  value: string;
  hostUserId: string;
  disabled?: boolean;
  onChange: (orgId: string) => void;
}) {
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const appliedDefault = useRef(false);

  useEffect(() => {
    getSpojexClient()
      .from("organizations")
      .select("id, name, public_id, logo_url, user_id, is_platform, verified")
      .order("is_platform", { ascending: false })
      .order("name")
      .limit(200)
      .then(({ data }) => {
        setOrgs((data ?? []) as OrganizationRow[]);
      });
  }, []);

  // Default to Spojex platform org when none is linked yet.
  useEffect(() => {
    if (disabled || value || appliedDefault.current || orgs.length === 0) return;
    const platform = orgs.find((item) => item.is_platform);
    if (!platform?.id) return;
    appliedDefault.current = true;
    onChange(platform.id);
  }, [disabled, onChange, orgs, value]);

  const selected = orgs.find((item) => item.id === value);

  return (
    <label className="grid gap-1 text-sm">
      <span className="text-text-secondary">Host organization (follow + gifts)</span>
      <select
        className={fieldClass}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">— None —</option>
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.is_platform ? "★ " : ""}
            {org.name}
            {org.is_platform ? " (default)" : ""}
            {org.verified ? " ✓" : ""}
          </option>
        ))}
      </select>
      {selected ? (
        <p className="text-xs text-text-secondary">
          Gifts go to owner ·{" "}
          <Link href={`/admin/organizations/${selected.id}`} className="text-primary underline">
            View org profile
          </Link>
          {hostUserId ? ` · host user ${hostUserId.slice(0, 8)}…` : ""}
        </p>
      ) : (
        <p className="text-xs text-text-secondary">
          New lives default to Spojex. Create the Spojex org under Organizations if missing.
        </p>
      )}
    </label>
  );
}
