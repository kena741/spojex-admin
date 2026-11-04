"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchEmojis } from "@/lib/emoji-catalog";
import { cn } from "@/lib/utils";

type EmojiPickerFieldProps = {
  value: string;
  onChange: (emoji: string) => void;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  placeholder?: string;
  /** Allow typing/pasting a custom emoji outside the catalog. */
  allowCustom?: boolean;
};

export function EmojiPickerField({
  value,
  onChange,
  disabled = false,
  className,
  buttonClassName,
  placeholder = "Pick",
  allowCustom = true,
}: EmojiPickerFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchEmojis(query), [query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  const pick = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex h-10 min-w-14 items-center justify-center gap-1 rounded-lg border border-border bg-background px-2 text-lg hover:bg-muted/50 disabled:opacity-50",
          buttonClassName,
        )}
        title={value ? `Emoji ${value}` : placeholder}
      >
        <span aria-hidden>{value || "🙂"}</span>
        {!value ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            {placeholder}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={listId}
          role="dialog"
          aria-label="Emoji picker"
          className="absolute left-0 z-50 mt-1 w-72 rounded-xl border border-border bg-card p-2 shadow-lg"
        >
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search emoji…"
            className="mb-2 h-9 w-full rounded-lg border border-border px-3 text-sm"
          />
          {allowCustom ? (
            <div className="mb-2 flex items-center gap-2">
              <input
                value={value}
                onChange={(event) => onChange(event.target.value.slice(0, 8))}
                placeholder="Or paste emoji"
                className="h-8 flex-1 rounded-md border border-border px-2 text-sm"
                aria-label="Custom emoji"
              />
              {value ? (
                <button
                  type="button"
                  onClick={() => pick("")}
                  className="h-8 rounded-md px-2 text-xs text-text-secondary hover:bg-muted"
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="grid max-h-52 grid-cols-8 gap-1 overflow-y-auto p-0.5">
            {results.length === 0 ? (
              <p className="col-span-8 px-2 py-6 text-center text-xs text-text-secondary">
                No matches
              </p>
            ) : (
              results.map((entry) => (
                <button
                  key={`${entry.emoji}-${entry.name}`}
                  type="button"
                  title={entry.name}
                  onClick={() => pick(entry.emoji)}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-lg hover:bg-muted",
                    value === entry.emoji && "bg-muted ring-1 ring-primary",
                  )}
                >
                  {entry.emoji}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
