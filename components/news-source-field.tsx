"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  collectRecentNewsSources,
  rememberNewsSource,
} from "@/lib/news-sources";

type NewsSourceFieldProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Called on blur or when a recent chip is picked (edit-page save). */
  onCommit?: (value: string) => void;
  knownSources?: Array<{ source?: string | null } | string>;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  label?: string;
  hint?: string;
  /** When true, shows an “optional” marker next to the label. */
  optional?: boolean;
};

export function NewsSourceField({
  value,
  defaultValue = "",
  onChange,
  onCommit,
  knownSources = [],
  disabled,
  className,
  inputClassName = "h-10 w-full rounded-lg border border-border px-3 text-sm",
  placeholder = "Optional - e.g. Reuters, ESPN",
  label,
  hint,
  optional = true,
}: NewsSourceFieldProps) {
  const listId = useId();
  const controlled = value !== undefined;
  const [inner, setInner] = useState(controlled ? value : defaultValue);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (controlled) setInner(value);
  }, [controlled, value]);

  const recent = useMemo(() => {
    const rows = knownSources.map((item) =>
      typeof item === "string" ? { source: item } : item,
    );
    return collectRecentNewsSources(rows);
    // tick refreshes after rememberNewsSource writes localStorage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownSources, tick]);

  const current = controlled ? value : inner;
  const suggestions = recent.filter(
    (item) => item.toLowerCase() !== (current ?? "").trim().toLowerCase(),
  );

  const apply = (next: string, commit: boolean) => {
    if (!controlled) setInner(next);
    onChange?.(next);
    if (commit) {
      const trimmed = next.trim();
      if (trimmed) {
        rememberNewsSource(trimmed);
        setTick((n) => n + 1);
      }
      onCommit?.(next);
    }
  };

  return (
    <div className={className}>
      {label ? (
        <span className="mb-1 flex items-baseline gap-1.5 text-sm text-text-secondary">
          {label}
          {optional ? (
            <span className="text-[11px] font-normal text-text-hint">optional</span>
          ) : null}
        </span>
      ) : null}
      <input
        value={current}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => apply(e.target.value, false)}
        onBlur={(e) => {
          const next = e.target.value;
          if (next.trim()) {
            rememberNewsSource(next);
            setTick((n) => n + 1);
          }
          onCommit?.(next.trim());
        }}
        className={inputClassName}
        list={listId}
        autoComplete="off"
      />
      <datalist id={listId}>
        {recent.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      {suggestions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="w-full text-[11px] text-text-hint">Recently used</span>
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => apply(item, true)}
              className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-text-secondary transition hover:border-primary/40 hover:bg-primary/10 hover:text-text-primary disabled:opacity-50"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-text-secondary">{hint}</p> : null}
    </div>
  );
}
