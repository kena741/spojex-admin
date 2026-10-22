"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminReloadButton,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
  type AdminRowMenuItem,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { formatEventWhen } from "@/lib/events";
import { adminFetch, postAdminResponse } from "@/lib/hooks";
import {
  allowedLifecycleActions,
  canManageLiveEvents,
  canWriteLiveEvents,
  defaultStreamKind,
  formatCountdown,
  isDevelopmentBuild,
  isFightKind,
  isScoreKind,
  liveEventKinds,
  liveEventLanes,
  liveEventStatuses,
  liveKindLabel,
  liveSourceTypeLabel,
  liveStatusLabel,
  liveStreamKinds,
  liveTimezones,
  liveVisibilities,
  mockLiveStreams,
  zonedLocalToIso,
  type LiveLifecycleAction,
} from "@/lib/live-events";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { LiveEventRow, OrganizationRow } from "@/lib/types";

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

type OrgOption = Pick<OrganizationRow, "id" | "name" | "public_id"> & { is_platform?: boolean | null };

const steps = [
  { id: "identity", label: "Identity" },
  { id: "org", label: "Organization" },
  { id: "schedule", label: "Schedule" },
  { id: "thumbnail", label: "Thumbnail" },
  { id: "source", label: "Source" },
  { id: "visibility", label: "Visibility" },
  { id: "publish", label: "Draft / schedule" },
] as const;

type WizardForm = {
  kind: string;
  name: string;
  home_name: string;
  away_name: string;
  fighter_a: string;
  fighter_b: string;
  competition: string;
  host_org_id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  source_type: string;
  stream_url: string;
  stream_kind: string;
  mock_id: string;
  visibility: string;
  chat_enabled: boolean;
  publish: "scheduled" | "draft";
};

const initialForm: WizardForm = {
  kind: "football",
  name: "",
  home_name: "",
  away_name: "",
  fighter_a: "",
  fighter_b: "",
  competition: "",
  host_org_id: "",
  starts_at: "",
  ends_at: "",
  timezone: "Africa/Addis_Ababa",
  source_type: "external_url",
  stream_url: "",
  stream_kind: "video",
  mock_id: "video",
  visibility: "public",
  chat_enabled: true,
  publish: "scheduled",
};

function sourceBadge(row: LiveEventRow) {
  const type = row.source_type || "external_url";
  const hasUrl = Boolean(row.stream_url?.trim());
  const ready = row.source_ready === true || hasUrl;
  return { type, ready, hasUrl };
}

/** Live Events list (formerly the Video tab) used by the Streams hub. */
export default function LiveEventsPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = canWriteLiveEvents(can);

  const [rows, setRows] = useState<LiveEventRow[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [lane, setLane] = useState(searchParams.get("lane") || "all");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [laneCounts, setLaneCounts] = useState<Record<string, number>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(initialForm);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [showDevSources, setShowDevSources] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const devSources = isDevelopmentBuild || showDevSources;

  const load = useCallback(async (activeLane = lane) => {
    const params = new URLSearchParams();
    if (activeLane && activeLane !== "all") params.set("lane", activeLane);
    const qs = params.toString();
    const response = await adminFetch(`/api/admin/live-events${qs ? `?${qs}` : ""}`);
    const payload = (await response.json().catch(() => ({}))) as {
      data?: LiveEventRow[];
      lanes?: Record<string, number>;
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load");
    setRows(payload.data ?? []);
    if (payload.lanes) setLaneCounts(payload.lanes);
  }, [lane]);

  useEffect(() => {
    if (!canManageLiveEvents(can)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    load(lane)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // Refetch when lane changes; search/kind/status filter client-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can, lane]);

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

  // URL: write tab=live (old links used tab=video - the hub accepts both).
  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "live");
    if (lane !== "all") next.set("lane", lane);
    else next.delete("lane");
    if (status !== "all" && lane === "all") next.set("status", status);
    else next.delete("status");
    const nextString = next.toString();
    if (nextString !== searchParams.toString()) {
      router.replace(`/admin/streams?${nextString}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane, status]);

  const reload = () => {
    setLoading(true);
    setError(null);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    // Server already applies lane/status/kind/q when Python BFF is up;
    // keep a light client filter for local fallback responses.
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind !== "all" && row.kind !== kind) return false;
      if (lane === "all" && status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return [
        row.name,
        row.home_name,
        row.away_name,
        row.fighter_a,
        row.fighter_b,
        row.location,
        row.competition,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [kind, lane, query, rows, status]);

  const orgName = (row: LiveEventRow) =>
    orgs.find((org) => org.id === row.host_org_id)?.name ?? null;

  const runLifecycle = async (row: LiveEventRow, action: LiveLifecycleAction) => {
    let reason: string | undefined;
    if (action.reasonRequired) {
      reason = window.prompt(`Reason to ${action.label.toLowerCase()} "${row.name}":`)?.trim();
      if (!reason) {
        setError("A reason is required for this action.");
        return;
      }
    } else if (action.id === "go_live" || action.id === "finish") {
      if (!window.confirm(`${action.label}: "${row.name}"?`)) return;
    }
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      await postAdminResponse(`/api/admin/live-events/${row.id}/actions`, {
        action: action.id,
        reason,
      });
      setNotice(`${row.name}: ${action.label} applied.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const menuItems = (row: LiveEventRow): AdminRowMenuItem[] => {
    const base = `/admin/live-events/${row.id}`;
    const items: AdminRowMenuItem[] = [
      { id: "open", label: "Open", href: base },
      { id: "broadcast", label: "Broadcast controls", href: `${base}?tab=broadcast` },
      { id: "audience", label: "Audience & activity", href: `${base}?tab=audience` },
    ];
    if (canWrite) {
      allowedLifecycleActions(row.status).forEach((action, index) => {
        const blocked =
          action.id === "go_live" && !sourceBadge(row).ready ? "Add a playback source first" : null;
        items.push({
          id: action.id,
          label: blocked ? `${action.label} (no source)` : action.label,
          tone: action.tone === "danger" ? "danger" : action.tone === "success" ? "success" : "default",
          disabled: Boolean(blocked),
          separatorBefore: index === 0,
          onClick: () => void runLifecycle(row, action),
        });
      });
    }
    return items;
  };

  const resetWizard = () => {
    setForm({ ...initialForm, host_org_id: orgs.find((org) => org.is_platform)?.id ?? "" });
    setStep(0);
    setThumbnail(null);
    setCreateError(null);
    setCreatedId(null);
    setShowDevSources(false);
  };

  const openCreate = () => {
    resetWizard();
    setCreateOpen(true);
  };

  const patchForm = (patch: Partial<WizardForm>) => setForm((current) => ({ ...current, ...patch }));

  const stepError = (index: number): string | null => {
    switch (steps[index].id) {
      case "identity":
        if (!form.name.trim()) return "Give the event a name.";
        return null;
      case "schedule": {
        if (!form.starts_at) return "Choose a start time.";
        const start = zonedLocalToIso(form.starts_at, form.timezone);
        if (!start) return "Start time is not valid.";
        if (form.ends_at) {
          const end = zonedLocalToIso(form.ends_at, form.timezone);
          if (!end || end <= start) return "End time must be after the start time.";
        }
        return null;
      }
      case "source":
        if (form.source_type === "ingest") return "Broadcaster ingest is not available yet.";
        if (form.source_type === "external_url" && form.stream_url.trim()) {
          try {
            const url = new URL(form.stream_url.trim());
            if (url.protocol !== "http:" && url.protocol !== "https:") {
              return "Playback URL must start with http:// or https://";
            }
          } catch {
            return "Enter a full playback URL, or leave it empty to add it later.";
          }
        }
        return null;
      default:
        return null;
    }
  };

  const goNext = () => {
    const problem = stepError(step);
    if (problem) {
      setCreateError(problem);
      return;
    }
    setCreateError(null);
    setStep((current) => Math.min(steps.length - 1, current + 1));
  };

  const submitCreate = async () => {
    if (!canWrite) return;
    for (let i = 0; i < steps.length; i += 1) {
      const problem = stepError(i);
      if (problem) {
        setStep(i);
        setCreateError(problem);
        return;
      }
    }
    setCreating(true);
    setCreateError(null);
    try {
      const mock = mockLiveStreams.find((item) => item.id === form.mock_id) ?? mockLiveStreams[0];
      const isMock = form.source_type === "mock_dev";
      const streamUrl = isMock ? mock.url : form.stream_url.trim();
      const streamKind = isMock ? mock.stream_kind : form.stream_kind;
      const visibility = form.publish === "draft" ? "private" : form.visibility;

      const payload = await postAdminResponse("/api/admin/live-events", {
        kind: form.kind,
        name: form.name.trim(),
        starts_at: zonedLocalToIso(form.starts_at, form.timezone),
        ends_at: form.ends_at ? zonedLocalToIso(form.ends_at, form.timezone) : null,
        status: "scheduled",
        stream_url: streamUrl,
        stream_kind: streamKind,
        competition: form.competition.trim(),
        host_org_id: form.host_org_id || undefined,
        chat_enabled: form.chat_enabled,
        ...(isScoreKind(form.kind)
          ? { home_name: form.home_name.trim(), away_name: form.away_name.trim() }
          : {}),
        ...(isFightKind(form.kind)
          ? { fighter_a: form.fighter_a.trim(), fighter_b: form.fighter_b.trim() }
          : {}),
      });
      const created = payload.data as LiveEventRow | undefined;
      if (!created?.id) {
        await load();
        setCreateOpen(false);
        return;
      }
      setCreatedId(created.id);

      const warnings: string[] = [];
      // Source type, visibility and timezone are not part of the create route - apply right after.
      try {
        await postAdminResponse(`/api/admin/live-events/${created.id}/actions`, {
          action: "update",
          reason: form.publish === "draft" ? "Created as draft" : "Created from wizard",
          patch: {
            source_type: form.source_type,
            visibility,
            timezone: form.timezone,
          },
        });
      } catch (err) {
        warnings.push(
          `Event created, but source/visibility/timezone were not saved (${
            err instanceof Error ? err.message : "error"
          }). Review them in Settings.`,
        );
      }

      if (thumbnail) {
        try {
          const body = new FormData();
          body.append("file", thumbnail);
          const response = await adminFetch(`/api/admin/live-events/${created.id}/image`, {
            method: "POST",
            body,
          });
          const result = (await response.json().catch(() => ({}))) as { error?: string };
          if (!response.ok) throw new Error(result.error || "Upload failed");
        } catch (err) {
          warnings.push(
            `Thumbnail upload failed (${err instanceof Error ? err.message : "error"}). You can upload it from Settings.`,
          );
        }
      }

      if (warnings.length > 0) {
        setCreateError(warnings.join(" "));
        await load();
        return;
      }
      setCreateOpen(false);
      router.push(`/admin/live-events/${created.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const sourceTypeOptions = [
    { id: "external_url", label: "External URL (hosted HLS / MP4 / audio link)", disabled: false },
    {
      id: "ingest",
      label: "Broadcaster ingest - not available yet",
      disabled: true,
    },
    ...(devSources
      ? [{ id: "mock_dev", label: "Mock sample file (development / testing only)", disabled: false }]
      : []),
  ];

  const isLastStep = step === steps.length - 1;

  return (
    <>
      <p className="mb-4 text-sm text-text-secondary">
        <strong className="font-medium text-text-primary">Live Events</strong> is the former Video
        tab: scheduled matches, fights, shows and streams. A countdown reaching zero never means
        the event is live - it needs an explicit go-live.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {liveEventLanes.map((item) => {
          const count = item.id === "all" ? undefined : laneCounts[item.id];
          const active = lane === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setLane(item.id);
                setStatus("all");
              }}
              className={
                active
                  ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-muted"
              }
            >
              {item.label}
              {count != null ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <AdminFilterPanel>
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search events" />
          <div className="flex flex-wrap gap-2">
            <AdminSelect value={kind} onChange={setKind}>
              <option value="all">All kinds</option>
              {liveEventKinds.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </AdminSelect>
            {lane === "all" ? (
              <AdminSelect value={status} onChange={setStatus}>
                <option value="all">All statuses</option>
                {liveEventStatuses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </AdminSelect>
            ) : null}
            <AdminReloadButton onClick={reload} loading={loading} />
          </div>
        </AdminFilterPanel>
        {canWrite ? (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            New live event
          </button>
        ) : null}
      </div>
      {loading ? <AdminLoadingRow label="Loading live events…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title="No live events"
            description="Create a stream, match, fight, or show. The app shows a countdown until start; it only goes live when you go live."
          />
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">Kind</th>
                <th className="px-4 py-3 font-semibold">Schedule</th>
                <th className="px-4 py-3 font-semibold">Lifecycle</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const source = sourceBadge(row);
                const secondsToStart =
                  row.status === "scheduled"
                    ? Math.round((new Date(row.starts_at).getTime() - now) / 1000)
                    : null;
                const host = orgName(row);
                return (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
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
                        <div className="min-w-0">
                          <Link
                            href={`/admin/live-events/${row.id}`}
                            className="font-medium text-text-primary hover:text-primary"
                          >
                            {row.name}
                          </Link>
                          {host ? <p className="text-xs text-text-secondary">{host}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{liveKindLabel(row.kind)}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      <p>{formatEventWhen(row.starts_at)}</p>
                      {secondsToStart != null ? (
                        <p className="text-[11px]">{formatCountdown(secondsToStart)}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone(row.status)}>
                        {liveStatusLabel(row.status)}
                      </StatusBadge>
                      {row.visibility && row.visibility !== "public" ? (
                        <p className="mt-0.5 text-[11px] text-text-secondary capitalize">
                          {row.visibility}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      <p>{liveSourceTypeLabel(source.type)}</p>
                      <p
                        className={`text-[11px] ${
                          source.ready ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {source.ready
                          ? "Source ready"
                          : row.kind === "football" || row.kind === "basketball" || row.kind === "fight"
                            ? "No source (score only)"
                            : "No source yet"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AdminRowMenu
                        items={menuItems(row)}
                        disabled={busyId === row.id}
                        aria-label={`Actions for ${row.name}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </AdminTableShell>

      <AdminModal
        open={createOpen}
        title={`New live event - step ${step + 1} of ${steps.length}`}
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
        className="max-w-xl"
        footer={
          createdId ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-medium"
              >
                Stay here
              </button>
              <button
                type="button"
                onClick={() => router.push(`/admin/live-events/${createdId}`)}
                className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Open event
              </button>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  if (step === 0) setCreateOpen(false);
                  else setStep(step - 1);
                }}
                disabled={creating}
                className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
              >
                {step === 0 ? "Cancel" : "Back"}
              </button>
              {isLastStep ? (
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void submitCreate()}
                  className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {creating
                    ? "Creating…"
                    : form.publish === "draft"
                      ? "Create draft"
                      : "Create scheduled event"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  Next
                </button>
              )}
            </div>
          )
        }
      >
        <ol className="mb-4 flex flex-wrap gap-1.5 text-[11px]">
          {steps.map((item, index) => (
            <li
              key={item.id}
              className={`rounded-full border px-2 py-0.5 ${
                index === step
                  ? "border-primary bg-primary/10 text-primary"
                  : index < step
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-border text-text-secondary"
              }`}
            >
              {index + 1}. {item.label}
            </li>
          ))}
        </ol>

        {createError ? <AdminErrorAlert message={createError} /> : null}

        {steps[step].id === "identity" ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">
                Kind <span className="text-red-600">*</span>
              </span>
              <select
                className={fieldClass}
                value={form.kind}
                onChange={(e) =>
                  patchForm({ kind: e.target.value, stream_kind: defaultStreamKind(e.target.value) })
                }
              >
                {liveEventKinds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">
                Event name <span className="text-red-600">*</span>
              </span>
              <input
                className={fieldClass}
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
                placeholder="e.g. Ethiopia vs Egypt - AFCON qualifier"
              />
            </label>
            {isScoreKind(form.kind) ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Home team</span>
                  <input
                    className={fieldClass}
                    value={form.home_name}
                    onChange={(e) => patchForm({ home_name: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Away team</span>
                  <input
                    className={fieldClass}
                    value={form.away_name}
                    onChange={(e) => patchForm({ away_name: e.target.value })}
                  />
                </label>
              </div>
            ) : null}
            {isFightKind(form.kind) ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Fighter A</span>
                  <input
                    className={fieldClass}
                    value={form.fighter_a}
                    onChange={(e) => patchForm({ fighter_a: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Fighter B</span>
                  <input
                    className={fieldClass}
                    value={form.fighter_b}
                    onChange={(e) => patchForm({ fighter_b: e.target.value })}
                  />
                </label>
              </div>
            ) : null}
            {isScoreKind(form.kind) || isFightKind(form.kind) ? null : (
              <p className="text-xs text-text-secondary">
                Match and fight fields are hidden for this kind.
              </p>
            )}
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Competition / series (optional)</span>
              <input
                className={fieldClass}
                value={form.competition}
                onChange={(e) => patchForm({ competition: e.target.value })}
              />
            </label>
          </div>
        ) : null}

        {steps[step].id === "org" ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Host organization</span>
              <select
                className={fieldClass}
                value={form.host_org_id}
                onChange={(e) => patchForm({ host_org_id: e.target.value })}
              >
                <option value="">Default (Spojex platform)</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.is_platform ? "★ " : ""}
                    {org.name} ({org.public_id})
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-text-secondary">
              Viewers follow this organization and its owner receives coin gifts during the event.
            </p>
          </div>
        ) : null}

        {steps[step].id === "schedule" ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">
                Timezone <span className="text-red-600">*</span>
              </span>
              <select
                className={fieldClass}
                value={form.timezone}
                onChange={(e) => patchForm({ timezone: e.target.value })}
              >
                {liveTimezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">
                Starts ({form.timezone}) <span className="text-red-600">*</span>
              </span>
              <input
                type="datetime-local"
                className={fieldClass}
                value={form.starts_at}
                onChange={(e) => patchForm({ starts_at: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Ends ({form.timezone}) - optional</span>
              <input
                type="datetime-local"
                className={fieldClass}
                value={form.ends_at}
                onChange={(e) => patchForm({ ends_at: e.target.value })}
              />
            </label>
            {form.starts_at && zonedLocalToIso(form.starts_at, form.timezone) ? (
              <p className="text-xs text-text-secondary">
                That is {new Date(zonedLocalToIso(form.starts_at, form.timezone)!).toLocaleString()}{" "}
                in your browser&apos;s timezone.
              </p>
            ) : null}
            <p className="text-xs text-text-secondary">
              The app shows a countdown to this time. It does not go live by itself.
            </p>
          </div>
        ) : null}

        {steps[step].id === "thumbnail" ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Thumbnail image (optional)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
              />
            </label>
            <p className="text-xs text-text-secondary">
              JPG, PNG, WebP or GIF, max 5 MB. It uploads right after the event is created. You can
              skip this and upload later from Settings.
            </p>
            {thumbnail ? (
              <p className="text-xs text-text-primary">Selected: {thumbnail.name}</p>
            ) : null}
          </div>
        ) : null}

        {steps[step].id === "source" ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Source type</span>
              <select
                className={fieldClass}
                value={form.source_type}
                onChange={(e) => patchForm({ source_type: e.target.value })}
              >
                {sourceTypeOptions.map((item) => (
                  <option key={item.id} value={item.id} disabled={item.disabled}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="rounded-lg bg-muted/50 p-3 text-xs text-text-secondary">
              <strong className="text-text-primary">External URL</strong> plays a link you provide.{" "}
              <strong className="text-text-primary">Ingest</strong> (the broadcaster pushing video to
              Spojex) is unsupported today and cannot be selected.
            </p>
            {form.source_type === "external_url" ? (
              <>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Playback URL (optional now)</span>
                  <input
                    className={fieldClass}
                    value={form.stream_url}
                    onChange={(e) => patchForm({ stream_url: e.target.value })}
                    placeholder="https://… .m3u8 / .mp4 / .mp3"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Media type</span>
                  <select
                    className={fieldClass}
                    value={form.stream_kind}
                    onChange={(e) => patchForm({ stream_kind: e.target.value })}
                  >
                    {liveStreamKinds.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                {!form.stream_url.trim() ? (
                  <p className="text-xs text-amber-700">
                    Without a URL the event stays score-only and cannot go live until a source is
                    added.
                  </p>
                ) : null}
              </>
            ) : null}
            {form.source_type === "mock_dev" ? (
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Mock sample</span>
                <select
                  className={fieldClass}
                  value={form.mock_id}
                  onChange={(e) => patchForm({ mock_id: e.target.value })}
                >
                  {mockLiveStreams.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!isDevelopmentBuild ? (
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={showDevSources}
                  onChange={(e) => {
                    setShowDevSources(e.target.checked);
                    if (!e.target.checked && form.source_type === "mock_dev") {
                      patchForm({ source_type: "external_url" });
                    }
                  }}
                />
                <span>Development / testing sources</span>
              </label>
            ) : null}
          </div>
        ) : null}

        {steps[step].id === "visibility" ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Who can see this event</span>
              <select
                className={fieldClass}
                value={form.visibility}
                onChange={(e) => patchForm({ visibility: e.target.value })}
              >
                {liveVisibilities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.chat_enabled}
                onChange={(e) => patchForm({ chat_enabled: e.target.checked })}
              />
              <span>Live chat enabled</span>
            </label>
          </div>
        ) : null}

        {steps[step].id === "publish" ? (
          <div className="grid gap-3 text-sm">
            <label className="flex gap-3 rounded-lg border border-border p-3">
              <input
                type="radio"
                name="publish"
                checked={form.publish === "scheduled"}
                onChange={() => patchForm({ publish: "scheduled" })}
              />
              <span>
                <span className="block font-medium">Scheduled</span>
                <span className="text-xs text-text-secondary">
                  Visible as {form.visibility}; countdown runs until you go live.
                </span>
              </span>
            </label>
            <label className="flex gap-3 rounded-lg border border-border p-3">
              <input
                type="radio"
                name="publish"
                checked={form.publish === "draft"}
                onChange={() => patchForm({ publish: "draft" })}
              />
              <span>
                <span className="block font-medium">Draft</span>
                <span className="text-xs text-text-secondary">
                  Saved as Private so it is hidden from the app. Change Visibility in Settings when
                  ready to publish.
                </span>
              </span>
            </label>
            <dl className="grid gap-1 rounded-lg bg-muted/50 p-3 text-xs text-text-secondary">
              <div>
                <dt className="inline font-medium text-text-primary">{liveKindLabel(form.kind)}: </dt>
                <dd className="inline">{form.name || "-"}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-text-primary">Starts: </dt>
                <dd className="inline">
                  {form.starts_at ? `${form.starts_at.replace("T", " ")} (${form.timezone})` : "-"}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-text-primary">Source: </dt>
                <dd className="inline">
                  {liveSourceTypeLabel(form.source_type)}
                  {form.source_type === "external_url" && !form.stream_url.trim() ? " (not set)" : ""}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </AdminModal>
    </>
  );
}
