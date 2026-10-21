"use client";

import { cn } from "@/lib/utils";
import type { RangeKey } from "@/lib/analytics";

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "custom", label: "Custom" },
];

type Props = {
  range: RangeKey;
  start?: string;
  end?: string;
  timezone: string;
  lastUpdated?: string;
  onRangeChange: (range: RangeKey) => void;
  onCustomChange: (start: string, end: string) => void;
  className?: string;
};

export function AnalyticsDateFilter({
  range,
  start,
  end,
  timezone,
  lastUpdated,
  onRangeChange,
  onCustomChange,
  className,
}: Props) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onRangeChange(p.key)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              range === p.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-text-secondary hover:border-primary/40 hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
        {range === "custom" ? (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={start || ""}
              onChange={(e) => onCustomChange(e.target.value, end || e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs"
            />
            <span className="text-xs text-text-hint">→</span>
            <input
              type="date"
              value={end || ""}
              onChange={(e) => onCustomChange(start || e.target.value, e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs"
            />
          </div>
        ) : null}
      </div>
      <div className="text-[11px] text-text-hint">
        <span className="mr-3">TZ: {timezone}</span>
        {lastUpdated ? (
          <span>Last updated: {new Date(lastUpdated).toLocaleString("en-GB", { timeZone: timezone })}</span>
        ) : null}
      </div>
    </div>
  );
}
