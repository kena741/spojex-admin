"use client";

import { HelpCircle, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { formatChange, formatCompact } from "@/lib/analytics";

type Props = {
  label: string;
  value: number | null | undefined;
  previous?: number | null;
  changePct?: number | null;
  kind?: "stock" | "period";
  tooltip?: string;
  status?: string;
  sparkline?: number[] | null;
  onClick?: () => void;
  className?: string;
};

export function KpiCard({
  label,
  value,
  previous,
  changePct,
  kind = "period",
  tooltip,
  status,
  sparkline,
  onClick,
  className,
}: Props) {
  const notTracked = status === "not_tracked" || value == null;
  const up = (changePct ?? 0) > 0;
  const down = (changePct ?? 0) < 0;
  const spark = (sparkline || []).map((v, i) => ({ i, v }));

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-shadow",
        onClick && "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        !onClick && "cursor-default",
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-hint">{label}</p>
          {kind === "stock" ? (
            <p className="mt-0.5 text-[10px] text-text-hint">Stock total</p>
          ) : (
            <p className="mt-0.5 text-[10px] text-text-hint">Selected period</p>
          )}
        </div>
        {tooltip ? (
          <span title={tooltip} className="shrink-0 text-text-hint">
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>

      {notTracked ? (
        <p className="font-heading text-lg font-semibold text-text-secondary">Not tracked yet</p>
      ) : (
        <p className="font-heading text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {formatCompact(value)}
        </p>
      )}

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-h-[1.25rem] text-xs">
          {!notTracked && changePct != null ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                up && "text-leaf",
                down && "text-destructive",
                !up && !down && "text-text-secondary",
              )}
            >
              {up ? <TrendingUp className="h-3 w-3" /> : null}
              {down ? <TrendingDown className="h-3 w-3" /> : null}
              {formatChange(changePct)}
              {previous != null ? (
                <span className="ml-1 font-normal text-text-hint">vs {formatCompact(previous)}</span>
              ) : null}
            </span>
          ) : !notTracked && kind === "period" ? (
            <span className="text-text-hint">No prior baseline</span>
          ) : null}
        </div>
        {spark.length > 1 ? (
          <div className="h-8 w-16 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark}>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#1545a2"
                  fill="#1545a2"
                  fillOpacity={0.12}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </button>
  );
}

export function KpiSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-card p-4">
      <div className="mb-3 h-3 w-24 rounded bg-muted" />
      <div className="h-7 w-20 rounded bg-muted" />
      <div className="mt-3 h-3 w-16 rounded bg-muted" />
    </div>
  );
}
