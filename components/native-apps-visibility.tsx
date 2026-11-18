"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { AdminErrorAlert } from "@/components/admin-layout";
import { NATIVE_APPS, QUICK_ACTION_COUNT } from "@/lib/native-apps-visibility";
import { cn } from "@/lib/utils";

type State = { hidden: string[]; order: string[] };

const LABELS: Record<string, string> = Object.fromEntries(NATIVE_APPS.map((a) => [a.key, a.label]));

/** Order + on/off for native apps. The first 7 shown apps are home quick actions. */
export function NativeAppsVisibility({ canEdit }: { canEdit: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/native-apps/visibility", { cache: "no-store" });
      const payload = (await res.json().catch(() => ({}))) as Partial<State> & { error?: string };
      if (cancelled) return;
      if (!res.ok) setError(payload.error || "Could not load native apps");
      else setState({ hidden: payload.hidden ?? [], order: payload.order ?? NATIVE_APPS.map((a) => a.key) });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (next: State) => {
    if (!canEdit || !state) return;
    const before = state;
    setState(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/native-apps/visibility", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const payload = (await res.json().catch(() => ({}))) as Partial<State> & { error?: string };
      if (!res.ok) throw new Error(payload.error || "Could not save");
      setState({ hidden: payload.hidden ?? next.hidden, order: payload.order ?? next.order });
    } catch (e) {
      setState(before);
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const move = (index: number, delta: number) => {
    if (!state) return;
    const order = [...state.order];
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    void save({ ...state, order });
  };

  const toggle = (key: string) => {
    if (!state) return;
    const hidden = state.hidden.includes(key) ? state.hidden.filter((k) => k !== key) : [...state.hidden, key];
    void save({ ...state, hidden });
  };

  // Position among *shown* apps decides quick action vs All apps page.
  let shownSoFar = 0;
  const rows = (state?.order ?? []).map((key) => {
    const on = !state?.hidden.includes(key);
    const place = on ? (shownSoFar++ < QUICK_ACTION_COUNT ? "quick" : "all") : "hidden";
    return { key, on, place };
  });
  const firstAll = rows.findIndex((r) => r.place === "all");

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-sm font-semibold">Apps in the Spojex app</h2>
      <p className="mb-3 text-xs text-text-hint">
        The first {QUICK_ACTION_COUNT} shown apps are home quick actions, next to the Apps button. The rest are on the All
        apps page. Turned-off apps are hidden everywhere. Phones update within about 10 minutes.
      </p>
      {error ? <AdminErrorAlert message={error} /> : null}
      {!state && !error ? <p className="text-sm text-text-hint">Loading…</p> : null}
      {state ? (
        <ol className="max-w-xl divide-y divide-border rounded-lg border border-border">
          {rows.map((r, i) => (
            <li key={r.key}>
              {i === firstAll ? (
                <p className="bg-muted px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-text-hint">
                  All apps page
                </p>
              ) : null}
              <div className={cn("flex items-center gap-2 px-3 py-2 text-sm", !r.on && "text-text-hint")}>
                <span className="w-5 text-xs tabular-nums text-text-hint">{i + 1}</span>
                <span className="flex-1 font-medium">{LABELS[r.key] ?? r.key}</span>
                {r.place === "quick" ? (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    Quick action
                  </span>
                ) : null}
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      aria-label={`Move ${LABELS[r.key]} up`}
                      disabled={saving || i === 0}
                      onClick={() => move(i, -1)}
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${LABELS[r.key]} down`}
                      disabled={saving || i === rows.length - 1}
                      onClick={() => move(i, 1)}
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.on}
                  aria-label={`Show ${LABELS[r.key]}`}
                  disabled={!canEdit || saving}
                  onClick={() => toggle(r.key)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 rounded-full transition disabled:opacity-60",
                    r.on ? "bg-primary" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition",
                      r.on ? "left-[18px]" : "left-0.5",
                    )}
                  />
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {!canEdit ? (
        <p className="mt-2 text-xs text-text-hint">You need the Edit global settings permission to change this.</p>
      ) : null}
    </section>
  );
}
