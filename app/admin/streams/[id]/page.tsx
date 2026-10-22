"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { adminFetch, deleteAdmin, postAdminResponse } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import {
  looksLikeStreamUrl,
  streamGenres,
  streamHealthLabel,
  streamHealthTone,
  streamStatusLabel,
  streamStatuses,
} from "@/lib/streams";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { OrganizationRow, RadioStreamRow } from "@/lib/types";

const tabs = [
  { id: "overview", label: "Overview & Preview" },
  { id: "activity", label: "Activity" },
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
  station: RadioStreamRow & {
    health_status?: string | null;
    health_message?: string | null;
    health_checked_at?: string | null;
  };
  attribution?: {
    managing_organization?: {
      id?: string | null;
      name?: string | null;
      public_id?: string | null;
      is_platform?: boolean | null;
    } | null;
    receiving_account_user_id?: string | null;
    receiving_account_name?: string | null;
    gifts_enabled?: boolean;
    gifts_unavailable_reason?: string | null;
    note?: string;
  };
  publication?: { enabled?: boolean; status?: string };
  playback_health?: {
    status?: string;
    checked_at?: string | null;
    message?: string;
    url_valid?: boolean;
    url_message?: string | null;
  };
  gifts?: { gift_count?: number; coins_sent?: number | string };
  moderation?: { report_count?: number; chat_href?: string };
  activity?: ActivityRow[];
  credentials?: { note?: string };
  error?: string;
};

type OrgOption = Pick<OrganizationRow, "id" | "name" | "public_id">;

type SettingsForm = {
  name: string;
  tagline: string;
  stream_url: string;
  image_url: string;
  genre: string;
  city: string;
  status: string;
  sort_order: string;
  is_featured: boolean;
  host_org_id: string;
  reason: string;
};

type PreviewState = "idle" | "loading" | "buffering" | "playing" | "error";

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted/40 disabled:text-text-secondary";

function formFromStation(station: Workspace["station"]): SettingsForm {
  return {
    name: station.name ?? "",
    tagline: station.tagline ?? "",
    stream_url: (station.stream_url ?? "").trim(),
    image_url: station.image_url ?? "",
    genre: station.genre ?? "Live radio",
    city: station.city ?? "",
    status: station.status ?? "inactive",
    sort_order: String(station.sort_order ?? 0),
    is_featured: Boolean(station.is_featured),
    host_org_id: station.host_org_id ?? "",
    reason: "",
  };
}

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const previewLabels: Record<PreviewState, string> = {
  idle: "Stopped",
  loading: "Loading stream…",
  buffering: "Buffering…",
  playing: "Playing",
  error: "Could not play this stream",
};

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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 rounded-lg border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export default function StreamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("streams:write");

  const [tab, setTab] = useState<TabId>("overview");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [touched, setTouched] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const intendedPlayRef = useRef(false);
  const [preview, setPreview] = useState<PreviewState>("idle");

  const loadWorkspace = useCallback(async () => {
    const response = await adminFetch(`/api/admin/streams/${id}/workspace`);
    const payload = (await response.json().catch(() => ({}))) as Workspace;
    if (!response.ok) throw new Error(payload.error || "Failed to load station");
    setWorkspace(payload);
    return payload;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    loadWorkspace()
      .then((payload) => {
        if (!cancelled) setForm(formFromStation(payload.station));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load station");
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
      .select("id, name, public_id")
      .order("name")
      .limit(500)
      .then(({ data, error: orgError }) => {
        if (!orgError) setOrgs((data ?? []) as OrgOption[]);
      });
  }, []);

  const dirty =
    editing &&
    form !== null &&
    workspace !== null &&
    JSON.stringify({ ...form, reason: "" }) !==
      JSON.stringify({ ...formFromStation(workspace.station), reason: "" });

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /** Stop + release the single audio element (idempotent). */
  const stopPreview = useCallback(() => {
    intendedPlayRef.current = false;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPreview("idle");
  }, []);

  const startPreview = (url: string) => {
    const audio = audioRef.current;
    if (!audio || !looksLikeStreamUrl(url)) return;
    // One player only: reset before starting.
    audio.pause();
    intendedPlayRef.current = true;
    setPreview("loading");
    audio.src = url;
    audio.load();
    audio.play().catch(() => {
      if (intendedPlayRef.current) setPreview("error");
    });
  };

  // Cleanup when leaving the page.
  useEffect(() => {
    const audio = audioRef.current;
    const intended = intendedPlayRef;
    return () => {
      intended.current = false;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
    };
  }, []);

  const stationUrl = (workspace?.station.stream_url ?? "").trim();
  // A changed URL invalidates whatever is currently playing.
  useEffect(() => {
    stopPreview();
  }, [stationUrl, stopPreview]);

  const switchTab = (next: TabId) => {
    if (next !== "overview") stopPreview();
    if (dirty && tab === "settings" && next !== "settings") {
      if (!window.confirm("You have unsaved Settings changes. Leave without saving?")) return;
      cancelEdit();
    }
    setTab(next);
  };

  const cancelEdit = () => {
    if (workspace) setForm(formFromStation(workspace.station));
    setEditing(false);
    setConflict(false);
    setTouched(false);
    setError(null);
  };

  const formErrors = form
    ? {
        name: form.name.trim() ? null : "Name is required.",
        stream_url: !form.stream_url.trim()
          ? form.status === "active"
            ? "A stream URL is required to be on air."
            : null
          : looksLikeStreamUrl(form.stream_url)
            ? null
            : "Enter a full http:// or https:// URL.",
        city: null,
      }
    : null;
  const formValid = formErrors ? Object.values(formErrors).every((v) => !v) : false;

  const save = async () => {
    if (!canWrite || !form || !workspace) return;
    setTouched(true);
    if (!formValid) return;
    const station = workspace.station;
    const original = formFromStation(station);
    const patch: Record<string, unknown> = {};
    if (form.name.trim() !== original.name) patch.name = form.name.trim();
    if (form.tagline.trim() !== original.tagline.trim()) patch.tagline = form.tagline.trim();
    if (form.stream_url.trim() !== original.stream_url) patch.stream_url = form.stream_url.trim();
    if (form.image_url.trim() !== original.image_url.trim()) patch.image_url = form.image_url.trim();
    if (form.genre !== original.genre) patch.genre = form.genre;
    if (form.city.trim() !== original.city.trim()) patch.city = form.city.trim();
    if (form.status !== original.status) patch.status = form.status;
    if (form.is_featured !== original.is_featured) patch.is_featured = form.is_featured;
    if (Number(form.sort_order || 0) !== Number(original.sort_order || 0)) {
      patch.sort_order = Number(form.sort_order) || 0;
    }
    if (form.host_org_id !== original.host_org_id) patch.host_org_id = form.host_org_id || null;
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
      await postAdminResponse(`/api/admin/streams/${id}/actions`, {
        action: "update",
        reason: form.reason.trim() || undefined,
        patch: { ...patch, expected_updated_at: station.updated_at },
      });
      const next = await loadWorkspace();
      setForm(formFromStation(next.station));
      setEditing(false);
      setTouched(false);
      setNotice(
        "stream_url" in patch
          ? "Station saved. The stream URL changed, so playback health was reset — run a health check."
          : "Station saved.",
      );
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
      setForm(formFromStation(next.station));
      setConflict(false);
      setNotice("Loaded the latest version. Re-apply your changes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reload failed");
    }
  };

  const runAction = async (action: string, doneLabel: string) => {
    if (!canWrite) return;
    setError(null);
    setNotice(null);
    try {
      await postAdminResponse(`/api/admin/streams/${id}/actions`, { action });
      await loadWorkspace();
      setNotice(doneLabel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const healthCheck = async () => {
    if (!canWrite) return;
    setChecking(true);
    setError(null);
    setNotice(null);
    try {
      const result = await postAdminResponse<{
        health_status?: string;
        health_message?: string;
        playable_hint?: boolean;
        http_status?: number;
      }>(`/api/admin/streams/${id}/actions`, { action: "health_check" });
      await loadWorkspace();
      setNotice(
        `Health check: ${streamHealthLabel(result.health_status)}${
          result.health_message ? ` — ${result.health_message}` : ""
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setChecking(false);
    }
  };

  const remove = async () => {
    if (!workspace) return;
    if (!window.confirm(`Delete "${workspace.station.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      stopPreview();
      await deleteAdmin(`/api/admin/streams/${id}`);
      router.replace("/admin/streams?tab=radio");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // The audio element lives outside tab content so there is only ever one player.
  const audioElement = (
    <audio
      ref={audioRef}
      preload="none"
      className="hidden"
      onWaiting={() => intendedPlayRef.current && setPreview("buffering")}
      onStalled={() => intendedPlayRef.current && setPreview("buffering")}
      onPlaying={() => intendedPlayRef.current && setPreview("playing")}
      onCanPlay={() => {
        if (intendedPlayRef.current) setPreview((cur) => (cur === "loading" ? "buffering" : cur));
      }}
      onError={() => intendedPlayRef.current && setPreview("error")}
      onEnded={() => {
        intendedPlayRef.current = false;
        setPreview("idle");
      }}
    />
  );

  if (loading) {
    return (
      <>
        {audioElement}
        <AdminLoadingRow label="Loading station…" />
      </>
    );
  }
  if (!workspace || !form) {
    return (
      <>
        {audioElement}
        <AdminErrorAlert message={error || "Station not found"} />
      </>
    );
  }

  const station = workspace.station;
  const attribution = workspace.attribution;
  const health = workspace.playback_health;
  const healthStatus = health?.status || station.health_status || "unknown";
  const enabled = workspace.publication?.enabled ?? station.status === "active";
  const org = attribution?.managing_organization;
  const orgLabel =
    org?.name ?? orgs.find((item) => item.id === station.host_org_id)?.name ?? null;
  const chatHref = workspace.moderation?.chat_href ?? `/admin/radio-chat?stream=${id}`;
  const urlValid = health?.url_valid ?? looksLikeStreamUrl(stationUrl);
  const isHttpsPage = typeof window !== "undefined" && window.location.protocol === "https:";
  const mixedContent = isHttpsPage && stationUrl.startsWith("http://");
  const activity = workspace.activity ?? [];

  return (
    <>
      {audioElement}
      <AdminPageHeader
        title={station.name}
        description={`${station.genre ?? ""}${station.city ? ` · ${station.city}` : ""}`}
        backHref="/admin/streams?tab=radio"
        breadcrumbs={[
          { label: "Streams", href: "/admin/streams?tab=radio" },
          { label: station.name },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={chatHref}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Live chat
            </Link>
            {canWrite ? (
              <>
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => void healthCheck()}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {checking ? "Checking…" : "Run health check"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      enabled ? "disable" : "enable",
                      enabled ? "Station taken off air." : "Station put on air.",
                    )
                  }
                  className={
                    enabled
                      ? "rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                      : "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  }
                >
                  {enabled ? "Take off air" : "Put on air"}
                </button>
              </>
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
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-heading text-sm font-semibold">Preview</h2>
            {station.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={station.image_url}
                alt=""
                className="mb-3 h-40 w-full rounded-lg object-cover"
              />
            ) : null}
            {station.tagline ? (
              <p className="mb-3 text-sm text-text-secondary">{station.tagline}</p>
            ) : null}
            <p className="mb-3 break-all rounded-md bg-muted/50 px-3 py-2 text-xs text-text-secondary">
              {stationUrl || "No stream URL configured"}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={
                  !urlValid || !stationUrl || preview === "loading" || preview === "playing" || preview === "buffering"
                }
                onClick={() => startPreview(stationUrl)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Start preview
              </button>
              <button
                type="button"
                disabled={preview === "idle"}
                onClick={stopPreview}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Stop
              </button>
              <span
                role="status"
                aria-live="polite"
                className={`text-sm ${
                  preview === "error"
                    ? "text-red-600"
                    : preview === "playing"
                      ? "text-emerald-700"
                      : "text-text-secondary"
                }`}
              >
                {previewLabels[preview]}
              </span>
            </div>
            {preview === "error" ? (
              <p className="mt-2 text-xs text-text-secondary">
                {mixedContent
                  ? "This admin page is HTTPS but the stream is plain HTTP — browsers block it. Check the stream URL or use an HTTPS source."
                  : "The browser could not play this URL (it may be offline, geo-blocked, or not an audio stream)."}
              </p>
            ) : (
              <p className="mt-2 text-xs text-text-secondary">
                Preview plays in your browser only and stops when you leave this tab or page. A
                successful preview is not a health check.
              </p>
            )}
            {!stationUrl ? (
              <p className="mt-2 text-xs text-amber-700">Add a stream URL in Settings to enable preview.</p>
            ) : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-heading text-sm font-semibold">Status — three separate things</h2>
            <div className="grid gap-3">
              <Fact label="Configured (publication)">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={requestTone(station.status)}>
                    {streamStatusLabel(station.status)}
                  </StatusBadge>
                  {station.is_featured ? <StatusBadge tone="success">Featured</StatusBadge> : null}
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  {enabled
                    ? "Listed on air. This is configuration — it does not confirm the stream works."
                    : "Not listed on air."}
                </p>
              </Fact>
              <Fact label="Playback health (last probe)">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={streamHealthTone(healthStatus)}>
                    {streamHealthLabel(healthStatus)}
                  </StatusBadge>
                  <span className="text-xs text-text-secondary">
                    {health?.checked_at ? `Checked ${formatWhen(health.checked_at)}` : "Never checked"}
                  </span>
                </div>
                {health?.message ? (
                  <p className="mt-1 text-xs text-text-secondary">{health.message}</p>
                ) : null}
              </Fact>
              <Fact label="URL validity">
                <StatusBadge tone={urlValid ? "success" : "danger"}>
                  {urlValid ? "URL looks valid" : stationUrl ? "URL rejected" : "No URL"}
                </StatusBadge>
                <p className="mt-1 text-xs text-text-secondary">
                  {health?.url_message ??
                    "Shape and host checks only — says nothing about the stream being live."}
                </p>
              </Fact>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-heading text-sm font-semibold">Gift attribution</h2>
            <div className="grid gap-3 text-sm">
              <Fact label="Managing organization">
                {orgLabel ? (
                  <>
                    {org?.id || station.host_org_id ? (
                      <Link
                        href={`/admin/organizations/${org?.id ?? station.host_org_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {orgLabel}
                      </Link>
                    ) : (
                      <span className="font-medium">{orgLabel}</span>
                    )}
                    {org?.public_id ? (
                      <span className="ml-2 text-xs text-text-secondary">{org.public_id}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-amber-700">None assigned</span>
                )}
              </Fact>
              <Fact label="Receiving account">
                {attribution?.receiving_account_user_id ? (
                  <span>
                    {attribution.receiving_account_name ?? "Owner"}{" "}
                    <span className="text-xs text-text-secondary">
                      ({attribution.receiving_account_user_id.slice(0, 8)}…)
                    </span>
                  </span>
                ) : (
                  <span className="text-text-secondary">No receiving account</span>
                )}
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
                <p className="mt-1 text-xs text-text-secondary">
                  {workspace.gifts?.gift_count ?? 0} gifts ·{" "}
                  {workspace.gifts?.coins_sent ?? 0} coins received
                </p>
                <Link
                  href={`/admin/finance/transactions?module=gifts&q=${encodeURIComponent(id)}`}
                  className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                >
                  Open gift activity in Finance
                </Link>
                {attribution?.note ? (
                  <p className="mt-1 text-xs text-text-secondary">{attribution.note}</p>
                ) : null}
              </Fact>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-heading text-sm font-semibold">Chat & moderation</h2>
            <p className="text-sm text-text-secondary">
              {workspace.moderation?.report_count ?? 0} chat report
              {(workspace.moderation?.report_count ?? 0) === 1 ? "" : "s"} on this station.
            </p>
            <Link
              href={chatHref}
              className="mt-3 inline-flex rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Open live chat for this station
            </Link>
            {workspace.credentials?.note ? (
              <p className="mt-4 text-xs text-text-secondary">{workspace.credentials.note}</p>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === "activity" ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-heading text-sm font-semibold">Admin activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-text-secondary">No admin actions recorded for this station.</p>
          ) : (
            <ol className="space-y-3">
              {activity.map((item, index) => (
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
                  {item.reason ? (
                    <p className="mt-1 text-xs text-text-secondary">Reason: {item.reason}</p>
                  ) : null}
                  {item.actor_user_id ? (
                    <p className="mt-1 text-xs text-text-secondary">
                      By {item.actor_user_id.slice(0, 8)}…
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-sm font-semibold">Station settings</h2>
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
              <span className="text-xs text-text-secondary">Read-only (no streams:write)</span>
            )}
          </div>

          {conflict ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Someone else changed this station while you were editing.{" "}
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
            <Field label="Name" error={touched ? formErrors?.name : null}>
              <input
                className={fieldClass}
                disabled={!editing}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Managing organization" hint="Org owner receives coin gifts.">
              <select
                className={fieldClass}
                disabled={!editing}
                value={form.host_org_id}
                onChange={(e) => setForm({ ...form, host_org_id: e.target.value })}
              >
                <option value="">No org (gifts unavailable)</option>
                {orgs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.public_id})
                  </option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field
                label="Stream URL"
                hint="Direct audio link (MP3, AAC, Icecast, HLS). Changing it resets playback health."
                error={touched ? formErrors?.stream_url : null}
              >
                <input
                  className={fieldClass}
                  disabled={!editing}
                  value={form.stream_url}
                  onChange={(e) => setForm({ ...form, stream_url: e.target.value })}
                  placeholder="https://example.com/live.mp3"
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Tagline">
                <textarea
                  className="min-h-16 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:bg-muted/40"
                  disabled={!editing}
                  rows={2}
                  value={form.tagline}
                  onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Logo image URL">
              <input
                className={fieldClass}
                disabled={!editing}
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </Field>
            <Field label="Genre">
              <select
                className={fieldClass}
                disabled={!editing}
                value={form.genre}
                onChange={(e) => setForm({ ...form, genre: e.target.value })}
              >
                {[...new Set([form.genre, ...streamGenres])].filter(Boolean).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <input
                className={fieldClass}
                disabled={!editing}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <Field label="Publication status" hint="Configuration only — not playback health.">
              <select
                className={fieldClass}
                disabled={!editing}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {streamStatuses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Display order">
              <input
                type="number"
                className={fieldClass}
                disabled={!editing}
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                disabled={!editing}
                checked={form.is_featured}
                onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
              />
              <span>Featured station</span>
            </label>
            {editing ? (
              <div className="md:col-span-2">
                <Field label="Reason for change (optional)" hint="Recorded in the Activity tab.">
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
                Deleting a station removes it from the app. This cannot be undone.
              </p>
              <button
                type="button"
                onClick={() => void remove()}
                className="mt-3 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete station
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
