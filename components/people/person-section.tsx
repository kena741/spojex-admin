import type { ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Section chrome                                                      */
/* ------------------------------------------------------------------ */

export interface PersonSectionProps {
  id: string;
  title: string;
  description?: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}

/** Section title on the page canvas, content in a card beneath it. */
export function PersonSection({
  id,
  title,
  description,
  count,
  action,
  children,
}: PersonSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-heading text-sm font-semibold text-text-primary">
            {title}
            {count != null ? (
              <span className="ml-1.5 text-xs font-medium text-text-hint">{count}</span>
            ) : null}
          </h2>
          {description ? <p className="mt-0.5 text-xs text-text-secondary">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">{children}</div>
    </section>
  );
}

export interface PersonPanelProps {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}

/** Nested card used inside a section (services, bookings, wallet…). */
export function PersonPanel({ title, count, action, children }: PersonPanelProps) {
  return (
    <div className="min-w-0 rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          {title}
          {count != null ? <span className="ml-1.5 font-medium text-text-hint">{count}</span> : null}
        </h3>
        {action}
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
}

export interface PersonEmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  /** Borderless, tighter variant for use inside a panel. */
  compact?: boolean;
}

export function PersonEmptyState({ icon: Icon, title, hint, compact }: PersonEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 text-center",
        compact ? "px-2 py-3" : "rounded-lg border border-dashed border-border px-4 py-6",
      )}
    >
      <Icon className="h-5 w-5 text-text-hint" aria-hidden />
      <p className="text-sm text-text-secondary">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-text-hint">{hint}</p> : null}
    </div>
  );
}

export interface PersonSubHeadingProps {
  children: ReactNode;
}

export function PersonSubHeading({ children }: PersonSubHeadingProps) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-hint">
      {children}
    </h3>
  );
}

export interface PersonDisclosureProps {
  title: string;
  children: ReactNode;
}

/** Native disclosure so long profile docs stay collapsed until needed. */
export function PersonDisclosure({ title, children }: PersonDisclosureProps) {
  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Data rows                                                           */
/* ------------------------------------------------------------------ */

export interface PersonStatRowProps {
  label: string;
  value: string;
  strong?: boolean;
}

export function PersonStatRow({ label, value, strong }: PersonStatRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={cn("tabular-nums text-sm", strong ? "font-semibold" : "font-medium")}>
        {value}
      </dd>
    </div>
  );
}

export interface PersonMeterRowProps {
  label: string;
  value: number;
  /** Recent score, shown next to the lifetime score. */
  recent: number;
  max: number;
}

/** Feed affinity score as a labelled bar. */
export function PersonMeterRow({ label, value, recent, max }: PersonMeterRowProps) {
  const percent = max > 0 ? Math.max(4, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-text-primary">{label}</span>
        <span className="shrink-0 tabular-nums text-text-secondary">
          {value.toFixed(1)}
          <span className="text-text-hint"> / r {recent.toFixed(1)}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${percent}%` }} />
      </div>
    </li>
  );
}

export interface PersonChipsProps {
  items: string[];
  empty: string;
}

export function PersonChips({ items, empty }: PersonChipsProps) {
  if (items.length === 0) return <p className="text-xs text-text-secondary">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-text-primary"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
