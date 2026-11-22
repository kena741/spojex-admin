"use client";

import { useCallback, useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { adminFetch, putAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";

/** Master switch for Live Radio in the Spojex Stream hub. */
export default function RadioVisibilityToggle() {
  const { can } = useAdminPermissions();
  const canWrite = can("streams:write") || can("settings:write");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminFetch("/api/admin/streams/radio-visibility");
        const payload = (await res.json().catch(() => ({}))) as {
          radio_enabled?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(payload.error || "Could not load radio setting");
        if (!cancelled) setEnabled(payload.radio_enabled !== false);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load radio setting");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async () => {
    if (!canWrite || saving) return;
    const next = !enabled;
    setSaving(true);
    setError(null);
    try {
      await putAdmin("/api/admin/streams/radio-visibility", {
        radio_enabled: next,
      });
      setEnabled(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update radio setting");
    } finally {
      setSaving(false);
    }
  }, [canWrite, enabled, saving]);

  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Radio className="h-4 w-4 text-primary" />
            Show Live Radio in app
          </p>
          <p className="mt-1 text-xs leading-snug text-text-secondary">
            Turns the Live Radio tab, home card, and search filter on or off.
            Stations still use Put on air / Take off air individually.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!canWrite || loading || saving}
          onClick={() => void toggle()}
          className={[
            "relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50",
            enabled ? "bg-emerald-600" : "bg-muted",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform",
              enabled ? "left-7" : "left-1",
            ].join(" ")}
          />
          <span className="sr-only">{enabled ? "On" : "Off"}</span>
        </button>
      </div>
      {loading ? (
        <p className="mt-2 text-xs text-text-secondary">Loading…</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {!loading && !error ? (
        <p className="mt-2 text-xs font-medium text-text-secondary">
          {enabled ? "Radio is visible in the app." : "Radio is hidden in the app."}
        </p>
      ) : null}
    </div>
  );
}
