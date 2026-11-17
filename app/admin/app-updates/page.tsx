"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, Save } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow, AdminReloadButton } from "@/components/admin-layout";
import {
  APP_PLATFORMS,
  UPDATE_FREQUENCIES,
  compareVersions,
  type AppPlatform,
  type AppUpdateSettings,
} from "@/lib/app-updates";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { adminFetch, patchAdmin, postAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { cn } from "@/lib/utils";

type Overview = { platforms: Partial<Record<AppPlatform, AppUpdateSettings>> };

const PLATFORM_LABEL: Record<AppPlatform, string> = { android: "Android", ios: "iOS" };
const STORE_LABEL: Record<AppPlatform, string> = { android: "Google Play", ios: "App Store" };

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60";
const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

async function loadOverview(refresh = false): Promise<Overview> {
  const res = await adminFetch(`/api/admin/app-updates${refresh ? "?refresh=1" : ""}`);
  const payload = (await res.json().catch(() => ({}))) as { data?: Overview; error?: string };
  if (!res.ok) throw new Error(payload.error || "Could not load app update settings");
  return payload.data ?? { platforms: {} };
}

function formatWhen(iso: string | null) {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function AppUpdatesPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("settings:write");
  const { data, loading, refreshing, error, refresh, setData } = useAdminQuery<Overview>({
    key: adminCacheKey(["app-updates", "overview"]),
    fetcher: () => loadOverview(false),
  });
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const replace = (row: AppUpdateSettings) =>
    setData((current) => ({
      platforms: { ...(current?.platforms ?? {}), [row.platform]: row },
    }));

  const syncAll = async () => {
    setSyncingAll(true);
    setSyncError(null);
    try {
      const fresh = await loadOverview(true);
      setData(() => fresh);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Store check failed");
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="App Updates"
        description="Update prompts for the Spojex app. Changes reach phones on their next launch — no new release needed."
        actions={
          <>
            <button
              type="button"
              onClick={syncAll}
              disabled={syncingAll}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-text-secondary hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", syncingAll && "animate-spin")} aria-hidden />
              Check stores now
            </button>
            <AdminReloadButton onClick={refresh} loading={loading} refreshing={refreshing} />
          </>
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {syncError ? <AdminErrorAlert message={syncError} /> : null}
      {loading && !data ? <AdminLoadingRow label="Loading app update settings" /> : null}
      {data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {APP_PLATFORMS.map((platform) => {
            const row = data.platforms[platform];
            if (!row) {
              return (
                <div key={platform} className="rounded-xl border border-border bg-card p-5 text-sm text-text-secondary">
                  {PLATFORM_LABEL[platform]} settings are missing — run the backend migrations.
                </div>
              );
            }
            return (
              <PlatformCard
                key={`${platform}-${row.updated_at}-${row.store.checked_at}`}
                row={row}
                canWrite={canWrite}
                onSaved={replace}
              />
            );
          })}
        </div>
      ) : null}
      <HowItWorks />
    </div>
  );
}

function PlatformCard({
  row,
  canWrite,
  onSaved,
}: {
  row: AppUpdateSettings;
  canWrite: boolean;
  onSaved: (row: AppUpdateSettings) => void;
}) {
  const platform = row.platform;
  const [form, setForm] = useState(() => ({
    target_version: row.target_version,
    target_build: row.target_build == null ? "" : String(row.target_build),
    update_type: row.update_type,
    title: row.title,
    description: row.description,
    notify_enabled: row.notify_enabled,
    notify_frequency_hours: row.notify_frequency_hours,
    staged_rollout: row.staged_rollout,
    store_url: row.store.url,
    store_country: row.store.country,
  }));
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!message?.ok) return;
    const t = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(t);
  }, [message]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const storeVersion = row.store.version;
  const target = form.target_version.trim();
  const live: "live" | "not_live" | "unknown" =
    !target || !storeVersion
      ? "unknown"
      : compareVersions(storeVersion, target.split("+")[0]) >= 0
        ? "live"
        : "not_live";
  const mandatoryHeld =
    form.update_type === "mandatory" && (live !== "live" || form.staged_rollout);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const build = form.target_build.trim();
      const saved = (await patchAdmin(`/api/admin/app-updates/${platform}`, {
        target_version: target,
        target_build: build ? Number(build) : null,
        update_type: form.update_type,
        title: form.title,
        description: form.description,
        notify_enabled: form.notify_enabled,
        notify_frequency_hours: form.notify_frequency_hours,
        staged_rollout: form.staged_rollout,
        store_url: form.store_url,
        store_country: form.store_country,
      })) as AppUpdateSettings;
      setMessage({ ok: true, text: "Saved — phones pick this up on next launch." });
      onSaved(saved);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const fresh = (await postAdmin(`/api/admin/app-updates/${platform}/sync`, {})) as AppUpdateSettings;
      onSaved(fresh);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Store check failed" });
    } finally {
      setSyncing(false);
    }
  };

  const useStoreRelease = () => {
    setForm((f) => ({
      ...f,
      target_version: storeVersion,
      description: f.description || row.store.release_notes,
    }));
  };

  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">{PLATFORM_LABEL[platform]}</h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            row.notify_enabled && row.target_version
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-muted text-muted-foreground",
          )}
        >
          {row.notify_enabled && row.target_version ? "Prompt on" : "Prompt off"}
        </span>
      </div>

      {/* Store status */}
      <div className="mb-5 rounded-lg border border-border bg-background p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-text-hint">Live on {STORE_LABEL[platform]}</p>
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {storeVersion || "—"}
            </p>
            <p className="mt-0.5 text-xs text-text-hint">
              Checked {formatWhen(row.store.checked_at)}
              {row.store.released_at ? ` · released ${formatWhen(row.store.released_at)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {row.store.url ? (
              <a
                href={row.store.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-secondary hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Store page
              </a>
            ) : null}
            <button
              type="button"
              onClick={sync}
              disabled={syncing}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-secondary hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} aria-hidden /> Check
            </button>
          </div>
        </div>
        {row.store.error ? (
          <p className="mt-2 text-xs text-amber-600">{row.store.error}</p>
        ) : null}
        {row.store.release_notes ? (
          <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs text-text-secondary">
            {row.store.release_notes}
          </p>
        ) : null}
      </div>

      <fieldset disabled={!canWrite} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <div>
            <label className={labelClass} htmlFor={`${platform}-version`}>
              Version to prompt for
            </label>
            <div className="flex gap-2">
              <input
                id={`${platform}-version`}
                className={fieldClass}
                placeholder="e.g. 1.4.0"
                value={form.target_version}
                onChange={(e) => set("target_version", e.target.value)}
              />
              {storeVersion && storeVersion !== target ? (
                <button
                  type="button"
                  onClick={useStoreRelease}
                  className="shrink-0 rounded-lg border border-border px-2.5 text-xs text-text-secondary hover:text-foreground"
                >
                  Use {storeVersion}
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor={`${platform}-build`}>
              Build
            </label>
            <input
              id={`${platform}-build`}
              className={fieldClass}
              inputMode="numeric"
              placeholder="optional"
              value={form.target_build}
              onChange={(e) => set("target_build", e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
        {target && live === "not_live" ? (
          <Notice tone="warn">
            {STORE_LABEL[platform]} still shows {storeVersion}. Phones won&apos;t be prompted until{" "}
            {target} is live there.
          </Notice>
        ) : null}

        <div>
          <span className={labelClass}>Update type</span>
          <div className="grid grid-cols-2 gap-2">
            {(["optional", "mandatory"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => set("update_type", type)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm",
                  form.update_type === type
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-text-secondary hover:text-foreground",
                )}
              >
                <span className="block font-medium capitalize">{type}</span>
                <span className="block text-xs text-text-hint">
                  {type === "optional" ? "Users can dismiss it" : "Blocks the app until updated"}
                </span>
              </button>
            ))}
          </div>
          {mandatoryHeld ? (
            <Notice tone="warn">
              Shown as optional until the store confirms {target || "this version"} is live
              {form.staged_rollout ? " and the staged rollout is turned off" : ""}.
            </Notice>
          ) : null}
        </div>

        <div>
          <label className={labelClass} htmlFor={`${platform}-title`}>
            Title
          </label>
          <input
            id={`${platform}-title`}
            className={fieldClass}
            maxLength={120}
            placeholder="A new version of Spojex is available"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${platform}-desc`}>
            What&apos;s new
          </label>
          <textarea
            id={`${platform}-desc`}
            rows={5}
            maxLength={4000}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            placeholder={"New features, improvements and fixes.\nOne per line shows as a list."}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.notify_enabled}
              onChange={(e) => set("notify_enabled", e.target.checked)}
            />
            Show the update prompt
          </label>
          <div>
            <label className={labelClass} htmlFor={`${platform}-freq`}>
              Repeat (optional updates)
            </label>
            <select
              id={`${platform}-freq`}
              className={fieldClass}
              value={form.notify_frequency_hours}
              onChange={(e) => set("notify_frequency_hours", Number(e.target.value))}
            >
              {UPDATE_FREQUENCIES.some((f) => f.hours === form.notify_frequency_hours) ? null : (
                <option value={form.notify_frequency_hours}>
                  Every {form.notify_frequency_hours} hours
                </option>
              )}
              {UPDATE_FREQUENCIES.map((f) => (
                <option key={f.hours} value={f.hours}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          className="text-xs text-primary"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide advanced" : "Advanced"}
        </button>
        {showAdvanced ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.staged_rollout}
                onChange={(e) => set("staged_rollout", e.target.checked)}
              />
              <span>
                Staged rollout in progress
                <span className="block text-xs text-text-hint">
                  Not every user can download it yet, so a mandatory update is shown as optional.
                  Turn off once the rollout reaches 100%.
                </span>
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
              <div>
                <label className={labelClass} htmlFor={`${platform}-url`}>
                  Store URL
                </label>
                <input
                  id={`${platform}-url`}
                  className={fieldClass}
                  placeholder="Filled by the store check"
                  value={form.store_url}
                  onChange={(e) => set("store_url", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`${platform}-country`}>
                  Country
                </label>
                <input
                  id={`${platform}-country`}
                  className={fieldClass}
                  maxLength={2}
                  placeholder="us"
                  value={form.store_country}
                  onChange={(e) => set("store_country", e.target.value.toLowerCase())}
                />
              </div>
            </div>
          </div>
        ) : null}

        {message ? (
          <Notice tone={message.ok ? "ok" : "error"}>{message.text}</Notice>
        ) : null}
        {canWrite ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden />
              {saving ? "Saving…" : `Save ${PLATFORM_LABEL[platform]}`}
            </button>
          </div>
        ) : null}
      </fieldset>
      {row.updated_at ? (
        <p className="mt-3 text-xs text-text-hint">Last saved {formatWhen(row.updated_at)}</p>
      ) : null}
    </section>
  );
}

function Notice({ tone, children }: { tone: "warn" | "ok" | "error"; children: ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <p
      className={cn(
        "mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs",
        tone === "warn" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        tone === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        tone === "error" && "bg-red-500/10 text-red-600",
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function HowItWorks() {
  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4 text-xs leading-relaxed text-text-secondary sm:p-5">
      <p className="mb-1 font-medium text-foreground">How phones decide</p>
      <ul className="list-disc space-y-1 pl-4">
        <li>On every launch the app reads these settings and compares its installed version and build.</li>
        <li>Optional: a dismissible popup that comes back after the repeat interval.</li>
        <li>Mandatory: a popup that can&apos;t be closed until the user updates.</li>
        <li>
          A mandatory update is only enforced once the store shows that version (staged rollouts
          and store delays never lock users out). Until then it&apos;s shown as optional.
        </li>
        <li>&quot;Update now&quot; opens the Google Play or App Store page.</li>
      </ul>
    </div>
  );
}
