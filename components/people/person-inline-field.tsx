"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface Props {
  label: string;
  value: string;
  /** Resolves true when the value was persisted. */
  onSave: (value: string) => Promise<boolean>;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}

/**
 * Text field that saves on blur and reports its own state, so feedback stays
 * next to the field even when the page is scrolled.
 */
export function PersonInlineField({
  label,
  value,
  onSave,
  multiline,
  rows = 3,
  placeholder,
}: Props) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (state !== "saved") return;
    const timer = window.setTimeout(() => setState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [state]);

  const commit = async () => {
    if (draft === value) return;
    setState("saving");
    const ok = await onSave(draft);
    setState(ok ? "saved" : "idle");
  };

  const dirty = draft !== value;
  const fieldClass = cn(
    "w-full rounded-lg border bg-card px-3 text-sm text-text-primary transition-colors placeholder:text-text-hint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
    dirty ? "border-primary/50" : "border-border",
  );

  return (
    <label className="block text-sm">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="text-text-secondary">{label}</span>
        <span aria-live="polite" className="text-[11px] text-emerald-600">
          {state === "saving" ? <span className="text-text-hint">Saving…</span> : null}
          {state === "saved" ? "Saved" : null}
        </span>
      </span>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          rows={rows}
          placeholder={placeholder}
          className={cn(fieldClass, "py-2 leading-relaxed")}
        />
      ) : (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          placeholder={placeholder}
          className={cn(fieldClass, "h-10")}
        />
      )}
    </label>
  );
}
