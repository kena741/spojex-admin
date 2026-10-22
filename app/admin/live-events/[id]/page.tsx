"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { formatEventWhen } from "@/lib/events";
import { adminFetch, deleteAdmin, postAdminResponse } from "@/lib/hooks";
import {
  STREAMS_LIVE_HREF,
  allowedLifecycleActions,
  canWriteLiveEvents,
  formatCountdown,
  formatRoundClock,
  isDevelopmentBuild,
  isoToZonedLocal,
  liveEventAppRoute,
  liveEventKinds,
  liveKindLabel,
  liveSourceTypeLabel,
  liveStatusLabel,
  liveStreamKinds,
  liveTimezones,
  liveVisibilities,
  liveVisibilityLabel,
  matchPeriods,
  mockLiveStreams,
  parseRoundClock,
  zonedLocalToIso,
  type LiveLifecycleAction,
} from "@/lib/live-events";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { LiveEventRow, OrganizationRow } from "@/lib/types";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "broadcast", label: "Broadcast" },
  { id: "audience", label: "Audience & Activity" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = (typeof tabs)[number]["id"];

type ActivityRow = {
  id?: string;
  action?: string;
  actor_user_id?: string | null;
  reason?: string | null;
  created_at?: string;
  previous_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
};

type Workspace = {
  event: LiveEventRow;
  schedule?: {
    starts_at?: string | null;
    ends_at?: string | null;
    timezone?: string;
    actual_started_at?: string | null;
    actual_ended_at?: string | null;
    countdown_seconds?: number | null;
    note?: string;
  };
  lifecycle?: { status?: string; allowed_transitions?: string[] };
  source?: {
    type?: string;
    ready?: boolean;
    has_external_url?: boolean;
    can_go_live?: boolean;
    go_live_blocked_reason?: string | null;
    ingest_supported?: boolean;
    mock_dev_only?: boolean;
  };
  attribution?: {
    managing_organization?: { id?: string | null; name?: string | null; public_id?: string | null } | null;
    host_user_id?: string | null;
    host_display_name?: string | null;
    receiving_account_user_id?: string | null;
    gifts_enabled?: boolean;
    gifts_unavailable_reason?: string | null;
  };
  audience?: {
    viewer_count_field?: number | null;
    unique_viewers?: number | null;
    chat_messages?: number | null;
    analytics_note?: string;
    unavailable?: boolean;
  };
  gifts?: { gift_count?: number; coins_sent?: number | string };
  scoreboard?: {
    supported?: boolean;
    home_score?: number | null;
    away_score?: number | null;
  };
  fightboard?: {
    supported?: boolean;
    current_round?: number | null;
    fight_result?: string | null;
  };
  moderation?: { chat_enabled?: boolean | null; note?: string };
  activity?: ActivityRow[];
  credentials?: { note?: string };
  visibility?: string;
  error?: string;
};

type OrgOption = Pick<OrganizationRow, "id" | "name" | "public_id" | "is_platform">;

type SettingsForm = {
  name: string;
  kind: string;
  description: string;
  location: string;
  stadium: string;
  organizer: string;
  competition: string;
  host_org_id: string;
  timezone: string;
  starts_at: string;
  ends_at: string;
  visibility: string;
  chat_enabled: boolean;
  source_type: string;
  stream_kind: string;
  stream_url: string;
  replay_url: string;
  thumbnail_url: string;
  home_name: string;
  away_name: string;
  home_logo_url: string;
  away_logo_url: string;
  fighter_a: string;
  fighter_b: string;
  fighter_a_photo_url: string;
  fighter_b_photo_url: string;
  weight_class: string;
  total_rounds: string;
  reason: string;
};

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted/40 disabled:text-text-secondary";

function formFromEvent(event: LiveEventRow): SettingsForm {
  const timezone = event.timezone || "Africa/Addis_Ababa";
  return {
    name: event.name ?? "",
    kind: event.kind ?? "stream",
    description: event.description ?? "",
    location: event.location ?? "",
    stadium: event.stadium ?? "",
    organizer: event.organizer ?? "",
    competition: event.competition ?? "",
    host_org_id: event.host_org_id ?? "",
    timezone,
    starts_at: isoToZonedLocal(event.starts_at, timezone),
    ends_at: isoToZonedLocal(event.ends_at, timezone),
    visibility: event.visibility || "public",
    chat_enabled: event.chat_enabled !== false,
    source_type: event.source_type || "external_url",
    stream_kind: event.stream_kind || (event.kind === "radio" ? "audio" : "video"),
    stream_url: event.stream_url ?? "",
    replay_url: event.replay_url ?? "",
    thumbnail_url: event.thumbnail_url ?? "",
    home_name: event.home_name ?? "",
    away_name: event.away_name ?? "",
    home_logo_url: event.home_logo_url ?? "",
    away_logo_url: event.away_logo_url ?? "",
    fighter_a: event.fighter_a ?? "",
    fighter_b: event.fighter_b ?? "",
    fighter_a_photo_url: event.fighter_a_photo_url ?? "",
    fighter_b_photo_url: event.fighter_b_photo_url ?? "",
    weight_class: event.weight_class ?? "",
    total_rounds: String(event.total_rounds ?? 5),
    reason: "",
  };
}

function formatWhen(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-text-primary">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="text-xs text-text-secondary">{hint}</span>
      ) : null}
    </label>
  );
}

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-3 font-heading text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 rounded-lg border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Stepper({
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
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <span className="w-8 text-center text-lg font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          className="size-8 rounded-md border border-border text-lg leading-none disabled:opacity-40"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function LiveEventDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = canWriteLiveEvents(can);
  const canNotify = can("notifications:write");
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<TabId>(
    tabs.some((item) => item.id === initialTab) ? (initialTab as TabId) : "overview",
  );
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [touched, setTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [showDevSources, setShowDevSources] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Lifecycle (Broadcast tab) - separate from score controls.
  const [pending, setPending] = useState<LiveLifecycleAction | null>(null);
  const [reason, setReason] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  // Score / fight drafts - explicit "Update" buttons.
  const [score, setScore] = useState({
    home_score: 0,
    away_score: 0,
    match_minute: 0,
    match_period: "",
    status_line: "",
  });
  const [fight, setFight] = useState({
    current_round: 1,
    total_rounds: 5,
    clock: "03:00",
    fight_result: "",
    status_line: "",
  });
  const [boardBusy, setBoardBusy] = useState<"score" | "fight" | null>(null);

  const syncBoards = useCallback((event: LiveEventRow) => {
    setScore({
      home_score: event.home_score ?? 0,
      away_score: event.away_score ?? 0,
      match_minute: event.match_minute ?? 0,
      match_period: event.match_period ?? "",
      status_line: event.status_line ?? "",
    });
    setFight({
      current_round: event.current_round ?? 1,
      total_rounds: event.total_rounds ?? 5,
      clock: formatRoundClock(event.round_seconds_left ?? 0),
      fight_result: event.fight_result ?? "",
      status_line: event.status_line ?? "",
    });
  }, []);

  const loadWorkspace = useCallback(async () => {
    const response = await adminFetch(`/api/admin/live-events/${id}/workspace`);
    const payload = (await response.json().catch(() => ({}))) as Workspace;
    if (!response.ok) throw new Error(payload.error || "Failed to load live event");
    setWorkspace(payload);
    syncBoards(payload.event);
    return payload;
  }, [id, syncBoards]);

  useEffect(() => {
    let cancelled = false;
    loadWorkspace()
      .then((payload) => {
        if (!cancelled) setForm(formFromEvent(payload.event));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load live event");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadWorkspace]);

  useEffect(() => {
    getSpojexClient()
      .from("organizations")
      .select("id, name, public_id, is_platform")
      .order("is_platform", { ascending: false })
      .order("name")
      .limit(300)
      .then(({ data, error: orgError }) => {
        if (!orgError) setOrgs((data ?? []) as OrgOption[]);
      });
  }, []);

  const status = workspace?.lifecycle?.status || workspace?.event.status || "";
  useEffect(() => {
    if (status !== "scheduled") return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [status]);

  const dirty = useMemo(() => {
    if (!editing || !form || !workspace) return false;
    return (
      JSON.stringify({ ...form, reason: "" }) !==
      JSON.stringify({ ...formFromEvent(workspace.event), reason: "" })
    );
  }, [editing, form, workspace]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const cancelEdit = () => {
    if (workspace) setForm(formFromEvent(workspace.event));
    setEditing(false);
    setConflict(false);
    setTouched(false);
    setError(null);
  };

  const switchTab = (next: TabId) => {
    if (next !== "broadcast") setShowPlayer(false);
    if (dirty && tab === "settings" && next !== "settings") {
      if (!window.confirm("You have unsaved Settings changes. Leave without saving?")) return;
      cancelEdit();
    }
    setTab(next);
  };

  const settingsErrors = form
    ? {
        name: form.name.trim() ? null : "Name is required.",
        starts_at: form.starts_at ? null : "Start time is required.",
        ends_at: (() => {
          if (!form.ends_at) return null;
          const start = zonedLocalToIso(form.starts_at, form.timezone);
          const end = zonedLocalToIso(form.ends_at, form.timezone);
          if (!end) return "End time is not valid.";
          if (start && end <= start) return "End time must be after the start time.";
          return null;
        })(),
        stream_url: (() => {
          const value = form.stream_url.trim();
          if (!value) return null;
          try {
            const url = new URL(value);
            return url.protocol === "http:" || url.protocol === "https:"
              ? null
              : "Use an http:// or https:// URL.";
          } catch {
            return "Enter a full playback URL.";
          }
        })(),
      }
    : null;
  const settingsValid = settingsErrors ? Object.values(settingsErrors).every((v) => !v) : false;

  const save = async () => {
    if (!canWrite || !form || !workspace) return;
    setTouched(true);
    if (!settingsValid) return;
    const event = workspace.event;
    const original = formFromEvent(event);
    const patch: Record<string, unknown> = {};
    const textFields = [
      "name",
      "description",
      "location",
      "stadium",
      "organizer",
      "competition",
      "stream_url",
      "replay_url",
      "thumbnail_url",
      "home_name",
      "away_name",
      "home_logo_url",
      "away_logo_url",
      "fighter_a",
      "fighter_b",
      "fighter_a_photo_url",
      "fighter_b_photo_url",
      "weight_class",
    ] as const;
    for (const key of textFields) {
      if (form[key].trim() !== original[key].trim()) patch[key] = form[key].trim();
    }
    for (const key of ["kind", "visibility", "source_type", "stream_kind", "timezone"] as const) {
      if (form[key] !== original[key]) patch[key] = form[key];
    }
    if (form.chat_enabled !== original.chat_enabled) patch.chat_enabled = form.chat_enabled;
    if (form.host_org_id !== original.host_org_id) patch.host_org_id = form.host_org_id || null;
    if (Number(form.total_rounds) !== Number(original.total_rounds)) {
      patch.total_rounds = Math.max(1, Number(form.total_rounds) || 5);
    }
    const startIso = zonedLocalToIso(form.starts_at, form.timezone);
    if (startIso && new Date(startIso).getTime() !== new Date(event.starts_at).getTime()) {
      patch.starts_at = startIso;
    }
    const endIso = form.ends_at ? zonedLocalToIso(form.ends_at, form.timezone) : null;
    const originalEnd = event.ends_at ? new Date(event.ends_at).getTime() : null;
    if ((endIso ? new Date(endIso).getTime() : null) !== originalEnd) patch.ends_at = endIso;

    if (Object.keys(patch).length === 0) {
      setNotice("No changes to save.");
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    setConflict(false);
    try {
      await postAdminResponse(`/api/admin/live-events/${id}/actions`, {
        action: "update",
        reason: form.reason.trim() || undefined,
        patch: { ...patch, expected_updated_at: event.updated_at },
      });
      const next = await loadWorkspace();
      setForm(formFromEvent(next.event));
      setEditing(false);
      setTouched(false);
      setNotice("Settings saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      if (/conflict|modified by someone else/i.test(message)) setConflict(true);
    } finally {
      setSaving(false);
    }
  };

  const reloadAfterConflict = async () => {
    setError(null);
    try {
      const next = await loadWorkspace();
      setForm(formFromEvent(next.event));
      setConflict(false);
      setNotice("Loaded the latest version. Re-apply your changes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reload failed");
    }
  };

  const runLifecycle = async () => {
    if (!pending) return;
    if (pending.reasonRequired && !reason.trim()) {
      setError("A reason is required for this action.");
      return;
    }
    setLifecycleBusy(true);
    setError(null);
    setNotice(null);
    try {
      await postAdminResponse(`/api/admin/live-events/${id}/actions`, {
        action: pending.id,
        reason: reason.trim() || undefined,
      });
      const next = await loadWorkspace();
      if (!editing) setForm(formFromEvent(next.event));
      setNotice(`${pending.label} applied.`);
      setPending(null);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const updateBoard = async (kind: "score" | "fight") => {
    setBoardBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await postAdminResponse(`/api/admin/live-events/${id}/actions`, {
        action: kind === "score" ? "update_score" : "update_fight",
        patch:
          kind === "score"
            ? {
                home_score: score.home_score,
                away_score: score.away_score,
                match_minute: score.match_minute,
                match_period: score.match_period,
                status_line: score.status_line,
              }
            : {
                current_round: fight.current_round,
                total_rounds: fight.total_rounds,
                round_seconds_left: parseRoundClock(fight.clock),
                fight_result: fight.fight_result,
                status_line: fight.status_line,
              },
      });
      const next = await loadWorkspace();
      if (!editing) setForm(formFromEvent(next.event));
      setNotice(kind === "score" ? "Score updated." : "Fight board updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBoardBusy(null);
    }
  };

  const uploadThumbnail = async (file: File) => {
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await adminFetch(`/api/admin/live-events/${id}/image`, {
        method: "POST",
        body,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; thumbnail_url?: string };
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      const next = await loadWorkspace();
      setForm((current) =>
        current ? { ...current, thumbnail_url: next.event.thumbnail_url ?? "" } : current,
      );
      setNotice("Thumbnail updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (thumbInputRef.current) thumbInputRef.current.value = "";
    }
  };

  const notifyAudience = async () => {
    if (!workspace || !canNotify) return;
    const event = workspace.event;
    const live = event.status === "live";
    const title = live ? `${event.name} is LIVE` : `${event.name} starts soon`;
    const body = live
      ? "Open Spojex to watch and follow the live event."
      : `Starts ${formatEventWhen(event.starts_at)}.`;
    if (!window.confirm(`Send “${title}” to users with notifications enabled?`)) return;
    setNotifying(true);
    setError(null);
    setNotice(null);
    try {
      const response = await adminFetch("/api/admin/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, route: liveEventAppRoute(id) }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
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

  const remove = async () => {
    if (!workspace) return;
    if (!window.confirm(`Delete “${workspace.event.name}”? This cannot be undone.`)) return;
    try {
      await deleteAdmin(`/api/admin/live-events/${id}`);
      router.replace(STREAMS_LIVE_HREF);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (loading) return <AdminLoadingRow label="Loading live event…" />;
  if (!workspace || !form) return <AdminErrorAlert message={error || "Event not found"} />;

  const event = workspace.event;
  const source = workspace.source;
  const attribution = workspace.attribution;
  const audience = workspace.audience;
  const activity = workspace.activity ?? [];
  const timezone = workspace.schedule?.timezone || event.timezone || "Africa/Addis_Ababa";
  const actions = allowedLifecycleActions(status, workspace.lifecycle?.allowed_transitions);
  const sourceReady = source?.ready ?? Boolean(event.stream_url?.trim());
  const secondsToStart =
    status === "scheduled" && event.starts_at
      ? Math.round((new Date(event.starts_at).getTime() - now) / 1000)
      : (workspace.schedule?.countdown_seconds ?? null);
  const countdownText = status === "scheduled" ? formatCountdown(secondsToStart) : null;
  const scoreSupported = workspace.scoreboard?.supported === true;
  const fightSupported = workspace.fightboard?.supported === true;
  const org = attribution?.managing_organization;
  const orgLabel = org?.name ?? orgs.find((item) => item.id === event.host_org_id)?.name ?? null;
  const devVisible = isDevelopmentBuild || showDevSources || form.source_type === "mock_dev";
  const streamUrl = (event.stream_url ?? "").trim();
  const isAudio = event.stream_kind === "audio" || event.kind === "radio";

  return (
    <>
      <AdminPageHeader
        title={event.name}
        description={`${liveKindLabel(event.kind)} · ${formatEventWhen(event.starts_at)}`}
        backHref={STREAMS_LIVE_HREF}
        breadcrumbs={[
          { label: "Streams", href: STREAMS_LIVE_HREF },
          { label: "Live Events", href: STREAMS_LIVE_HREF },
          { label: event.name },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={requestTone(status)}>{liveStatusLabel(status)}</StatusBadge>
            {canNotify ? (
              <button
                type="button"
                disabled={notifying}
                onClick={() => void notifyAudience()}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {notifying ? "Notifying…" : "Notify audience"}
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

      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => switchTab(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === item.id
                ? "bg-muted font-medium text-text-primary"
                : "text-text-secondary hover:bg-muted/60"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Schedule">
            {event.thumbnail_url?.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.thumbnail_url}
                alt=""
                className="mb-3 h-40 w-full rounded-lg object-cover"
              />
            ) : null}
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Starts</dt>
                <dd className="text-right">
                  {formatWhen(workspace.schedule?.starts_at ?? event.starts_at)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Ends</dt>
                <dd className="text-right">{formatWhen(workspace.schedule?.ends_at ?? event.ends_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Event timezone</dt>
                <dd>{timezone}</dd>
              </div>
              {workspace.schedule?.actual_started_at ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-text-secondary">Actually went live</dt>
                  <dd className="text-right">{formatWhen(workspace.schedule.actual_started_at)}</dd>
                </div>
              ) : null}
              {workspace.schedule?.actual_ended_at ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-text-secondary">Actually ended</dt>
                  <dd className="text-right">{formatWhen(workspace.schedule.actual_ended_at)}</dd>
                </div>
              ) : null}
            </dl>
            {countdownText ? (
              <p className="mt-3 text-sm font-medium text-text-primary">{countdownText}</p>
            ) : null}
            <p className="mt-1 text-xs text-text-secondary">
              {workspace.schedule?.note ??
                "A countdown reaching zero does not mean the broadcast is live."}
            </p>
          </Card>

          <Card title="Lifecycle & source">
            <div className="grid gap-3">
              <Fact label="Lifecycle">
                <StatusBadge tone={requestTone(status)}>{liveStatusLabel(status)}</StatusBadge>
                <p className="mt-1 text-xs text-text-secondary">
                  {actions.length > 0
                    ? `Next: ${actions.map((item) => item.label).join(", ")}`
                    : "No further lifecycle changes (terminal state)."}
                </p>
                {canWrite && actions.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => switchTab("broadcast")}
                    className="mt-2 text-xs font-medium text-primary hover:underline"
                  >
                    Go to Broadcast controls
                  </button>
                ) : null}
              </Fact>
              <Fact label="Source readiness">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={sourceReady ? "success" : "warning"}>
                    {sourceReady ? "Source ready" : "No source"}
                  </StatusBadge>
                  <span className="text-xs text-text-secondary">
                    {liveSourceTypeLabel(source?.type ?? event.source_type)}
                  </span>
                </div>
                {!sourceReady && source?.go_live_blocked_reason ? (
                  <p className="mt-1 text-xs text-amber-700">{source.go_live_blocked_reason}</p>
                ) : null}
                <p className="mt-1 text-xs text-text-secondary">
                  Ready only means a playback URL is set - it does not prove the stream is up.
                </p>
              </Fact>
              <Fact label="Visibility">
                {liveVisibilityLabel(workspace.visibility ?? event.visibility)}
              </Fact>
            </div>
          </Card>

          <Card title="Organization, host & gifts">
            <div className="grid gap-3">
              <Fact label="Managing organization">
                {orgLabel ? (
                  <Link
                    href={`/admin/organizations/${org?.id ?? event.host_org_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {orgLabel}
                  </Link>
                ) : (
                  <span className="text-amber-700">None assigned</span>
                )}
                {attribution?.host_display_name ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    Host: {attribution.host_display_name}
                  </p>
                ) : null}
              </Fact>
              <Fact label="Gifts">
                <StatusBadge tone={attribution?.gifts_enabled ? "success" : "warning"}>
                  {attribution?.gifts_enabled ? "Gifts enabled" : "Gifts unavailable"}
                </StatusBadge>
                {!attribution?.gifts_enabled && attribution?.gifts_unavailable_reason ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    {attribution.gifts_unavailable_reason}
                  </p>
                ) : null}
                {attribution?.receiving_account_user_id ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    Receiving account {attribution.receiving_account_user_id.slice(0, 8)}…
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-text-secondary">
                  {workspace.gifts?.gift_count ?? 0} gifts · {workspace.gifts?.coins_sent ?? 0} coins
                </p>
              </Fact>
            </div>
          </Card>

          <Card title="Chat">
            <p className="text-sm text-text-secondary">
              Live chat is {workspace.moderation?.chat_enabled === false ? "off" : "on"} for this
              event.
              {audience && !audience.unavailable && audience.chat_messages != null
                ? ` ${audience.chat_messages} messages so far.`
                : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/admin/reports"
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                Moderation reports
              </Link>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => {
                    switchTab("settings");
                    setEditing(true);
                  }}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Change chat setting
                </button>
              ) : null}
            </div>
            {workspace.moderation?.note ? (
              <p className="mt-2 text-xs text-text-secondary">{workspace.moderation.note}</p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === "broadcast" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Lifecycle">
            <div className="mb-3 flex items-center gap-2">
              <StatusBadge tone={requestTone(status)}>{liveStatusLabel(status)}</StatusBadge>
              {countdownText ? (
                <span className="text-xs text-text-secondary">{countdownText}</span>
              ) : null}
            </div>
            {canWrite ? (
              actions.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  This event is in a terminal state; no lifecycle actions remain.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {actions.map((action) => {
                    const blocked = action.id === "go_live" && !sourceReady;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        disabled={blocked || lifecycleBusy}
                        title={blocked ? (source?.go_live_blocked_reason ?? "No source") : undefined}
                        onClick={() => {
                          setPending(action);
                          setReason("");
                          setError(null);
                        }}
                        className={`rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                          action.tone === "danger"
                            ? "border border-red-200 bg-red-50 text-red-700"
                            : action.tone === "success"
                              ? "bg-red-600 text-white"
                              : "border border-border bg-card hover:bg-muted"
                        }`}
                      >
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              <p className="text-sm text-text-secondary">You have read-only access.</p>
            )}
            {!sourceReady && actions.some((item) => item.id === "go_live") ? (
              <p className="mt-2 text-xs text-amber-700">
                {source?.go_live_blocked_reason ??
                  "Add a playback URL in Settings before going live."}
              </p>
            ) : null}
            {pending ? (
              <div className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium">Confirm: {pending.label}</p>
                <Field
                  label={pending.reasonRequired ? "Reason (required)" : "Reason (optional)"}
                  hint="Saved in the audit timeline."
                >
                  <input
                    className={fieldClass}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    autoFocus
                  />
                </Field>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={lifecycleBusy}
                    onClick={() => void runLifecycle()}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {lifecycleBusy ? "Applying…" : `Confirm ${pending.label.toLowerCase()}`}
                  </button>
                  <button
                    type="button"
                    disabled={lifecycleBusy}
                    onClick={() => setPending(null)}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </Card>

          <Card title="Source">
            <div className="grid gap-3 text-sm">
              <Fact label="Type">
                {liveSourceTypeLabel(source?.type ?? event.source_type)}
                {source?.mock_dev_only ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Development / testing sample - not for production audiences.
                  </p>
                ) : null}
              </Fact>
              <Fact label="Playback URL">
                {streamUrl ? (
                  <p className="break-all text-xs text-text-secondary">{streamUrl}</p>
                ) : (
                  <span className="text-text-secondary">None set</span>
                )}
              </Fact>
              <Fact label="Broadcaster ingest">
                <span className="text-text-secondary">
                  {source?.ingest_supported
                    ? "Supported."
                    : "Not supported yet - events play an external URL only. No stream keys exist."}
                </span>
              </Fact>
            </div>
            {streamUrl ? (
              <div className="mt-3">
                {showPlayer ? (
                  <>
                    <div className="overflow-hidden rounded-xl bg-black">
                      {isAudio ? (
                        <audio
                          key={streamUrl}
                          className="w-full"
                          controls
                          src={streamUrl}
                          onError={() => setError("Preview failed to load. Check the playback URL.")}
                        />
                      ) : (
                        <video
                          key={streamUrl}
                          className="aspect-video w-full"
                          controls
                          playsInline
                          src={streamUrl}
                          onError={() => setError("Preview failed to load. Check the playback URL.")}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPlayer(false)}
                      className="mt-2 text-xs font-medium text-primary hover:underline"
                    >
                      Hide and stop preview
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPlayer(true)}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
                  >
                    Preview source
                  </button>
                )}
              </div>
            ) : null}
            {workspace.credentials?.note ? (
              <p className="mt-3 text-xs text-text-secondary">{workspace.credentials.note}</p>
            ) : null}
          </Card>

          {scoreSupported ? (
            <Card title="Scoreboard" id="live-board">
              <p className="mb-3 text-xs text-text-secondary">
                Updating the score never changes the lifecycle. Use the Lifecycle card to go live.
              </p>
              <div className="grid gap-3">
                <Stepper
                  label={event.home_name || "Home"}
                  value={score.home_score}
                  disabled={!canWrite}
                  onChange={(value) => setScore({ ...score, home_score: value })}
                />
                <Stepper
                  label={event.away_name || "Away"}
                  value={score.away_score}
                  disabled={!canWrite}
                  onChange={(value) => setScore({ ...score, away_score: value })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Match minute">
                    <input
                      type="number"
                      min={0}
                      className={fieldClass}
                      disabled={!canWrite}
                      value={score.match_minute}
                      onChange={(e) =>
                        setScore({ ...score, match_minute: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </Field>
                  <Field label="Match period">
                    <select
                      className={fieldClass}
                      disabled={!canWrite}
                      value={score.match_period}
                      onChange={(e) => setScore({ ...score, match_period: e.target.value })}
                    >
                      {matchPeriods.map((item) => (
                        <option key={item || "none"} value={item}>
                          {item || "-"}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Status line (who scored / ticker)">
                  <input
                    className={fieldClass}
                    disabled={!canWrite}
                    value={score.status_line}
                    onChange={(e) => setScore({ ...score, status_line: e.target.value })}
                  />
                </Field>
                {canWrite ? (
                  <button
                    type="button"
                    disabled={boardBusy === "score"}
                    onClick={() => void updateBoard("score")}
                    className="justify-self-start rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {boardBusy === "score" ? "Updating…" : "Update score"}
                  </button>
                ) : null}
              </div>
            </Card>
          ) : null}

          {fightSupported ? (
            <Card title="Fight board" id="live-board">
              <p className="mb-3 text-xs text-text-secondary">
                Fight updates never change the lifecycle. Use the Lifecycle card to go live.
              </p>
              <div className="grid gap-3">
                <p className="text-sm font-medium">
                  {event.fighter_a || "Fighter A"} vs {event.fighter_b || "Fighter B"}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Current round">
                    <input
                      type="number"
                      min={1}
                      className={fieldClass}
                      disabled={!canWrite}
                      value={fight.current_round}
                      onChange={(e) =>
                        setFight({ ...fight, current_round: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </Field>
                  <Field label="Total rounds">
                    <input
                      type="number"
                      min={1}
                      className={fieldClass}
                      disabled={!canWrite}
                      value={fight.total_rounds}
                      onChange={(e) =>
                        setFight({ ...fight, total_rounds: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </Field>
                </div>
                <Field label="Round timer (mm:ss)">
                  <input
                    className={fieldClass}
                    disabled={!canWrite}
                    value={fight.clock}
                    onChange={(e) => setFight({ ...fight, clock: e.target.value })}
                  />
                </Field>
                <Field label="Winner / result">
                  <input
                    className={fieldClass}
                    disabled={!canWrite}
                    value={fight.fight_result}
                    onChange={(e) => setFight({ ...fight, fight_result: e.target.value })}
                  />
                </Field>
                <Field label="Status line (short fight update)">
                  <input
                    className={fieldClass}
                    disabled={!canWrite}
                    value={fight.status_line}
                    onChange={(e) => setFight({ ...fight, status_line: e.target.value })}
                  />
                </Field>
                {canWrite ? (
                  <button
                    type="button"
                    disabled={boardBusy === "fight"}
                    onClick={() => void updateBoard("fight")}
                    className="justify-self-start rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {boardBusy === "fight" ? "Updating…" : "Update fight board"}
                  </button>
                ) : null}
              </div>
            </Card>
          ) : null}

          {!scoreSupported && !fightSupported ? (
            <Card title="Live board">
              <p className="text-sm text-text-secondary">
                This kind of event has no score or fight controls. Use the lifecycle actions; if
                there is no source, the app still shows countdown, status and chat.
              </p>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "audience" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Audience">
            {audience?.unavailable ? (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-text-secondary">
                Audience analytics are unavailable for this event
                {audience.analytics_note ? ` - ${audience.analytics_note}` : "."} No numbers are
                shown rather than guessing zeros.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Fact label="Unique viewers">
                  {audience?.unique_viewers != null ? audience.unique_viewers.toLocaleString() : "Unavailable"}
                </Fact>
                <Fact label="Chat messages">
                  {audience?.chat_messages != null ? audience.chat_messages.toLocaleString() : "Unavailable"}
                </Fact>
                <Fact label="Viewer count (app field)">
                  {audience?.viewer_count_field != null
                    ? audience.viewer_count_field.toLocaleString()
                    : "Unavailable"}
                </Fact>
                <Fact label="Gifts">
                  {workspace.gifts?.gift_count ?? 0} · {workspace.gifts?.coins_sent ?? 0} coins
                </Fact>
              </div>
            )}
            {!audience?.unavailable && audience?.analytics_note ? (
              <p className="mt-3 text-xs text-text-secondary">{audience.analytics_note}</p>
            ) : null}
            {canNotify ? (
              <button
                type="button"
                disabled={notifying}
                onClick={() => void notifyAudience()}
                className="mt-4 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {notifying ? "Notifying…" : "Send push notification"}
              </button>
            ) : null}
          </Card>

          <Card title="Audit timeline">
            {activity.length === 0 ? (
              <p className="text-sm text-text-secondary">No admin actions recorded for this event.</p>
            ) : (
              <ol className="space-y-3">
                {activity.map((item, index) => {
                  const before = item.previous_state?.status;
                  const after = item.new_state?.status;
                  return (
                    <li
                      key={item.id ?? `${item.created_at}-${index}`}
                      className="rounded-lg border border-border p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium capitalize">
                          {(item.action ?? "update").replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-text-secondary">{formatWhen(item.created_at)}</span>
                      </div>
                      {typeof before === "string" && typeof after === "string" && before !== after ? (
                        <p className="mt-1 text-xs text-text-secondary">
                          {liveStatusLabel(before)} → {liveStatusLabel(after)}
                        </p>
                      ) : null}
                      {item.reason ? (
                        <p className="mt-1 text-xs text-text-secondary">Reason: {item.reason}</p>
                      ) : null}
                      {item.actor_user_id ? (
                        <p className="mt-1 text-xs text-text-secondary">
                          By {item.actor_user_id.slice(0, 8)}…
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "settings" ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-sm font-semibold">Event settings</h2>
            {canWrite ? (
              editing ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || !dirty}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setNotice(null);
                  }}
                  className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  Edit
                </button>
              )
            ) : (
              <span className="text-xs text-text-secondary">Read-only</span>
            )}
          </div>
          <p className="mb-4 text-xs text-text-secondary">
            Lifecycle status is changed on the Broadcast tab, not here.
          </p>

          {conflict ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Someone else changed this event while you were editing.{" "}
              <button
                type="button"
                onClick={() => void reloadAfterConflict()}
                className="font-medium underline"
              >
                Load latest version
              </button>{" "}
              and re-apply your changes.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Event name" error={touched ? settingsErrors?.name : null}>
              <input
                className={fieldClass}
                disabled={!editing}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Kind">
              <select
                className={fieldClass}
                disabled={!editing}
                value={form.kind}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kind: e.target.value,
                    ...(e.target.value === "radio" ? { stream_kind: "audio" } : {}),
                  })
                }
              >
                {liveEventKinds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Host organization" hint="Followers and gift credits go to this org's owner.">
              <select
                className={fieldClass}
                disabled={!editing}
                value={form.host_org_id}
                onChange={(e) => setForm({ ...form, host_org_id: e.target.value })}
              >
                <option value="">- None (gifts unavailable) -</option>
                {orgs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.is_platform ? "★ " : ""}
                    {item.name} ({item.public_id})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Organizer label">
              <input
                className={fieldClass}
                disabled={!editing}
                value={form.organizer}
                onChange={(e) => setForm({ ...form, organizer: e.target.value })}
              />
            </Field>

            <Field label="Timezone">
              <select
                className={fieldClass}
                disabled={!editing}
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              >
                {[...new Set<string>([form.timezone, ...liveTimezones])].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>
            <div />
            <Field label={`Starts (${form.timezone})`} error={touched ? settingsErrors?.starts_at : null}>
              <input
                type="datetime-local"
                className={fieldClass}
                disabled={!editing}
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              />
            </Field>
            <Field
              label={`Ends (${form.timezone}) - optional`}
              error={touched ? settingsErrors?.ends_at : null}
            >
              <input
                type="datetime-local"
                className={fieldClass}
                disabled={!editing}
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </Field>

            <Field label="Location">
              <input
                className={fieldClass}
                disabled={!editing}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="Competition / series">
              <input
                className={fieldClass}
                disabled={!editing}
                value={form.competition}
                onChange={(e) => setForm({ ...form, competition: e.target.value })}
              />
            </Field>
            {form.kind === "football" || form.kind === "basketball" ? (
              <>
                <Field label="Stadium / venue">
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.stadium}
                    onChange={(e) => setForm({ ...form, stadium: e.target.value })}
                  />
                </Field>
                <div />
                <Field label="Home team">
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.home_name}
                    onChange={(e) => setForm({ ...form, home_name: e.target.value })}
                  />
                </Field>
                <Field label="Away team">
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.away_name}
                    onChange={(e) => setForm({ ...form, away_name: e.target.value })}
                  />
                </Field>
                <Field label="Home logo URL">
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.home_logo_url}
                    onChange={(e) => setForm({ ...form, home_logo_url: e.target.value })}
                  />
                </Field>
                <Field label="Away logo URL">
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.away_logo_url}
                    onChange={(e) => setForm({ ...form, away_logo_url: e.target.value })}
                  />
                </Field>
              </>
            ) : null}
            {form.kind === "fight" ? (
              <>
                <Field label="Fighter A">
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.fighter_a}
                    onChange={(e) => setForm({ ...form, fighter_a: e.target.value })}
                  />
                </Field>
                <Field label="Fighter B">
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.fighter_b}
                    onChange={(e) => setForm({ ...form, fighter_b: e.target.value })}
                  />
                </Field>
                <Field label="Fighter A photo URL">
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.fighter_a_photo_url}
                    onChange={(e) => setForm({ ...form, fighter_a_photo_url: e.target.value })}
                  />
                </Field>
                <Field label="Fighter B photo URL">
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.fighter_b_photo_url}
                    onChange={(e) => setForm({ ...form, fighter_b_photo_url: e.target.value })}
                  />
                </Field>
                <Field label="Weight / category">
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.weight_class}
                    onChange={(e) => setForm({ ...form, weight_class: e.target.value })}
                  />
                </Field>
                <Field label="Total rounds">
                  <input
                    type="number"
                    min={1}
                    className={fieldClass}
                    disabled={!editing}
                    value={form.total_rounds}
                    onChange={(e) => setForm({ ...form, total_rounds: e.target.value })}
                  />
                </Field>
              </>
            ) : null}

            <div className="md:col-span-2">
              <Field label="Description">
                <textarea
                  className="min-h-24 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:bg-muted/40"
                  disabled={!editing}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Visibility">
              <select
                className={fieldClass}
                disabled={!editing}
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value })}
              >
                {liveVisibilities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                disabled={!editing}
                checked={form.chat_enabled}
                onChange={(e) => setForm({ ...form, chat_enabled: e.target.checked })}
              />
              <span>Live chat enabled</span>
            </label>

            <div className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Thumbnail</span>
              {form.thumbnail_url.trim() ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.thumbnail_url}
                    alt=""
                    className="h-40 w-full rounded-xl object-cover"
                  />
                  {editing ? (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, thumbnail_url: "" })}
                      className="absolute right-3 top-3 rounded-md bg-black/70 px-2.5 py-1.5 text-xs font-medium text-white"
                    >
                      Remove (applies on Save)
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-sm text-text-secondary">
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
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadThumbnail(file);
                    }}
                    className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                  />
                  <p className="mt-1 text-xs text-text-secondary">
                    JPG, PNG, WebP or GIF · max 5 MB · uploading saves the image immediately.
                    {uploading ? " Uploading…" : ""}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 rounded-lg border border-border p-4 md:col-span-2 md:grid-cols-2">
              <p className="text-sm font-medium md:col-span-2">Playback source</p>
              <Field label="Source type">
                <select
                  className={fieldClass}
                  disabled={!editing}
                  value={form.source_type === "mock_dev" ? "external_url" : form.source_type}
                  onChange={(e) => setForm({ ...form, source_type: e.target.value })}
                >
                  <option value="external_url">External URL</option>
                  <option value="ingest" disabled>
                    Broadcaster ingest - not available yet
                  </option>
                </select>
              </Field>
              <Field label="Media type">
                <select
                  className={fieldClass}
                  disabled={!editing}
                  value={form.stream_kind}
                  onChange={(e) => setForm({ ...form, stream_kind: e.target.value })}
                >
                  {liveStreamKinds.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field
                  label="Playback URL"
                  hint="External HLS / MP4 / audio link. Ingest (stream keys) is not supported."
                  error={touched ? settingsErrors?.stream_url : null}
                >
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.stream_url}
                    onChange={(e) => setForm({ ...form, stream_url: e.target.value })}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Replay / recording URL">
                  <input
                    className={fieldClass}
                    disabled={!editing}
                    value={form.replay_url}
                    onChange={(e) => setForm({ ...form, replay_url: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-4 md:col-span-2">
              <p className="text-sm font-medium text-amber-900">Development / testing</p>
              {devVisible ? (
                <>
                  <p className="text-xs text-amber-900">
                    Mock sample files are public test media. Applying one sets the source type to
                    Mock and takes effect only after Save.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {mockLiveStreams.map((mock) => (
                      <button
                        key={mock.id}
                        type="button"
                        disabled={!editing}
                        onClick={() =>
                          setForm({
                            ...form,
                            source_type: "mock_dev",
                            stream_url: mock.url,
                            stream_kind: mock.stream_kind,
                          })
                        }
                        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Use {mock.label.toLowerCase()}
                      </button>
                    ))}
                    {form.source_type === "mock_dev" ? (
                      <button
                        type="button"
                        disabled={!editing}
                        onClick={() =>
                          setForm({
                            ...form,
                            source_type: "external_url",
                            stream_url: "",
                          })
                        }
                        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Remove mock source
                      </button>
                    ) : null}
                  </div>
                  {form.source_type === "mock_dev" ? (
                    <p className="text-xs font-medium text-amber-900">
                      Current source type: Mock / dev sample.
                    </p>
                  ) : null}
                </>
              ) : (
                <label className="flex items-center gap-2 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    checked={showDevSources}
                    onChange={(e) => setShowDevSources(e.target.checked)}
                  />
                  <span>Show development / testing sources</span>
                </label>
              )}
            </div>

            {editing ? (
              <div className="md:col-span-2">
                <Field label="Reason for change (optional)" hint="Recorded in the audit timeline.">
                  <input
                    className={fieldClass}
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  />
                </Field>
              </div>
            ) : null}
          </div>

          {canWrite ? (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50/50 p-4">
              <p className="text-sm font-medium text-red-700">Danger zone</p>
              <p className="mt-1 text-xs text-text-secondary">
                Deleting removes the event and its history from the app. Prefer Cancel on the
                Broadcast tab to keep the record.
              </p>
              <button
                type="button"
                onClick={() => void remove()}
                className="mt-3 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete event
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

export default function LiveEventDetailPage() {
  return (
    <Suspense fallback={<AdminLoadingRow label="Loading live event…" />}>
      <LiveEventDetail />
    </Suspense>
  );
}
